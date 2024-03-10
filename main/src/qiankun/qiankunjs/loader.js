// import { importEntry } from 'import-html-entry';
import { importEntry } from '../import-html-entry';
import { concat, forEach, mergeWith } from 'lodash';
import {
    Deferred,
    genAppInstanceIdByName,
    getContainer,
    getDefaultTplWrapper,
    getWrapperId,
    isEnableScopedCSS,
    performanceGetEntriesByName,
    performanceMark,
    performanceMeasure,
    toArray,
    validateExportLifecycle,
} from './utils';
import getAddOns from './addons';
import { QiankunError } from './error';
import { getMicroAppStateActions } from './globalState';
import { cachedGlobals } from './sandbox/proxySandbox';
import { createSandboxContainer, css } from './sandbox';

const rawAppendChild = HTMLElement.prototype.appendChild;
const rawRemoveChild = HTMLElement.prototype.removeChild;

function assertElementExist(element, msg) {
    if (!element) {
        if (msg) {
            throw new QiankunError(msg);
        }

        throw new QiankunError('element not existed!');
    }
}

function execHooksChain(
    hooks,
    app,
    global = window,
) {
    if (hooks.length) {
        /* 循环执行异步函数
        hooks例子：async beforeLoad() { global.__POWERED_BY_QIANKUN__ = true;},
        */
        return hooks.reduce((chain, hook) => chain.then(() => hook(app, global)), Promise.resolve());
    }

    return Promise.resolve();
}

async function validateSingularMode(
    validate,
    app,
) {
    return typeof validate === 'function' ? validate(app) : !!validate;
}

/* 将子应用的index.html的字符串文本，转为真实dom的innerHTML的内容 */
function createElement(appContent, strictStyleIsolation, scopedCSS, appInstanceId) {
    const containerElement = document.createElement('div');
    /* innerHTML会将appContent内的 <html lang="en"> 标签字符串给去除*/
    containerElement.innerHTML = appContent;
    const appElement = containerElement.firstChild; // 脱离外层的div
    console.log('🚀 ~ createElement ~ appElement:', appElement)
    if (strictStyleIsolation) {
        if (!supportShadowDOM) {
            console.warn(
                '[qiankun]: As current browser not support shadow dom, your strictStyleIsolation configuration will be ignored!',
            );
        } else {
            const { innerHTML } = appElement;
            appElement.innerHTML = '';
            let shadow;

            if (appElement.attachShadow) {
                shadow = appElement.attachShadow({ mode: 'open' });
            } else {
                shadow = appElement.createShadowRoot();
            }
            shadow.innerHTML = innerHTML;
        }
    }

    if (scopedCSS) {
        const attr = appElement.getAttribute(css.QiankunCSSRewriteAttr);
        if (!attr) {
            appElement.setAttribute(css.QiankunCSSRewriteAttr, appInstanceId);
        }

        const styleNodes = appElement.querySelectorAll('style') || [];
        styleNodes.forEach((stylesheetElement) => {
            css.process(appElement, stylesheetElement, appInstanceId);
        });
    }
    return appElement;
}


/**
 * 获取渲染函数
 * 如果提供了传统的渲染函数，则使用它，否则我们将通过 qiankun 将应用元素插入目标容器
 * @param appInstanceId
 * @param appContent
 * @param legacyRender
 */
function getRender(appInstanceId, appContent, legacyRender) {
    const render = ({ element, loading, container }, phase) => {
        if (legacyRender) {
            if (process.env.NODE_ENV === 'development') {
                console.error(
                    '[qiankun] Custom rendering function is deprecated and will be removed in 3.0, you can use the container element setting instead!',
                );
            }

            return legacyRender({ loading, appContent: element ? appContent : '' });
        }
        /* 获取容器宿主元素 #appContainer */
        const containerElement = getContainer(container);
        console.log('🚀 ~ render ~ containerElement:', containerElement)

        // The container might have be removed after micro app unmounted.
        // Such as the micro app unmount lifecycle called by a react componentWillUnmount lifecycle, after micro app unmounted, the react component might also be removed
        if (phase !== 'unmounted') {
            const errorMsg = (() => {
                switch (phase) {
                    case 'loading':
                    case 'mounting':
                        return `Target container with ${container} not existed while ${appInstanceId} ${phase}!`;

                    case 'mounted':
                        return `Target container with ${container} not existed after ${appInstanceId} ${phase}!`;

                    default:
                        return `Target container with ${container} not existed while ${appInstanceId} rendering!`;
                }
            })();
            assertElementExist(containerElement, errorMsg);
        }

        if (containerElement && !containerElement.contains(element)) {
            // clear the container
            while (containerElement.firstChild) {
                rawRemoveChild.call(containerElement, containerElement.firstChild);
            }

            // append the element to container if it exist
            if (element) {
                /* 将子应用挂载在容器宿主作为容器的子元素 */
                rawAppendChild.call(containerElement, element);
            }
        }

        return undefined;
    };

    return render;
}


/** 生成应用包装器 DOM 获取器 */
function getAppWrapperGetter(
    appInstanceId,
    useLegacyRender,
    strictStyleIsolation,
    scopedCSS,
    elementGetter
) {
    return () => {
        if (useLegacyRender) {
            if (strictStyleIsolation) throw new QiankunError('strictStyleIsolation can not be used with legacy render!');
            if (scopedCSS) throw new QiankunError('experimentalStyleIsolation can not be used with legacy render!');

            const appWrapper = document.getElementById(getWrapperId(appInstanceId));
            assertElementExist(appWrapper, `Wrapper element for ${appInstanceId} is not existed!`);
            return appWrapper;
        }

        const element = elementGetter();
        assertElementExist(element, `Wrapper element for ${appInstanceId} is not existed!`);

        if (strictStyleIsolation && supportShadowDOM) {
            return element.shadowRoot;
        }

        return element;
    };
}


/* 从window === sandboxContainer.instance.proxy 子应用的沙箱容器内获取子应用生命周期 （沙箱容器的原型挂载有子应用的相关信息） */
function getLifecyclesFromExports(
    scriptExports,
    appName,
    global,
    globalLatestSetProp,
  ) {
    if (validateExportLifecycle(scriptExports)) {
      return scriptExports;
    }
  
    // fallback to sandbox latest set property if it had
    if (globalLatestSetProp) {
      const lifecycles = (global)[globalLatestSetProp];
      if (validateExportLifecycle(lifecycles)) {
        return lifecycles;
      }
    }
  
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[qiankun] lifecycle not found from ${appName} entry exports, fallback to get from window['${appName}']`,
      );
    }
  
    // fallback to global variable who named with ${appName} while module exports not found
    const globalVariableExports = (global)[appName];
  
    if (validateExportLifecycle(globalVariableExports)) {
      return globalVariableExports;
    }
  
    throw new QiankunError(`You need to export lifecycle functions in ${appName} entry`);
  }

  let prevAppUnmountedDeferred;

/* loadApp ===> 加载单个微应用
1. importEntry拉取并解析子应用的资源文件（template：html文件内容解析成string，js文件）(并非全部的js文件，近当前index.html的路由地址引用到的js文件)                                                                       
2. 将子应用的index.html内容组装父级加上id="__qiankun_microapp_wrapper_for标识，同时将这个string转为真实dom，最后将这个dom挂载(HTMLElement.prototype.appendChild)在指定子应用容器container内
3. 创建应用运行的时的沙箱环境
4. 执行子应用的js文件，获取js的导出的{ bootstrap, mount, unmount }生命周期函数
5. 从沙箱子应用的容器上的原型获取子应用的生命周期 
6. 获取子应用状态方法的action
7. 将子应用相关信息整合到这个parcelConfigGetter函数体内包裹配置，最终loadApp返回这个函数
*/
export async function loadApp(app, configuration = {}, lifeCycles) {
    const { entry, name: appName } = app;
    const appInstanceId = genAppInstanceIdByName(appName);

    const markName = `[qiankun] App ${appInstanceId} Loading`;
    if (process.env.NODE_ENV === 'development') {
        performanceMark(markName);
    }

    const {
        singular = false,
        sandbox = true,
        excludeAssetFilter,
        globalContext = window,
        ...importEntryOpts
    } = configuration;

    /* importEntry步骤
    1. 拉取对应地址的index.html文件
    2. 会先用正则匹配到其中的 js/css 相关标签，然后替换掉，它需要自己加载 js 并运行
    */
    const {
        template,
        execScripts,
        assetPublicPath,
        getExternalScripts
    } = await importEntry(entry, importEntryOpts);
    // console.log('🚀 ~ template:', template);
    // console.log('🚀 ~ execScripts:', execScripts);
    // console.log('🚀 ~ assetPublicPath:', assetPublicPath);
    // console.log('🚀 ~ getExternalScripts:', getExternalScripts);

    /* 上面注释掉了加载js的标签，手动加载拉取js文件 */
    await getExternalScripts();
 
    if (await validateSingularMode(singular, app)) {
        await (prevAppUnmountedDeferred && prevAppUnmountedDeferred.promise);
    }

    /* getDefaultTplWrapper
    将importEntry拉取的子应用的index.html组装成挂载在主应用的dom模板 ===>>>字符串
    即：将微应用dom最外层包裹qiankun标识的div，子级为微应用的index.html内容 (同时子应用的html文件内的，html，head(转为qiankun-head)，body去除)
    标识如：<div id="__qiankun_microapp_wrapper_for_app_vue_history__" data-name="app-vue-history" data-version="2.10.16" data-sandbox-cfg=true>
    appContent内容为字符串
    */
    const appContent = getDefaultTplWrapper(appInstanceId, sandbox)(template);
    console.log('🚀 ~ appContent:', appContent);

    const strictStyleIsolation = typeof sandbox === 'object' && !!sandbox.strictStyleIsolation;
    const scopedCSS = isEnableScopedCSS(sandbox);
    /* 转为真实dom */
    let initialAppWrapperElement = createElement(appContent, strictStyleIsolation, scopedCSS, appInstanceId);

    const initialContainer = 'container' in app ? app.container : undefined;
    const legacyRender = 'render' in app ? app.render : undefined;

    const render = getRender(appInstanceId, appContent, legacyRender);

    // 第一次加载设置应用可见区域 dom 结构
    // 确保每次应用加载前容器 dom 结构已经设置完毕
    /* 将子应用挂载到目标宿主容器上 */
    render({ element: initialAppWrapperElement, loading: true, container: initialContainer }, 'loading');

    const initialAppWrapperGetter = getAppWrapperGetter(
        appInstanceId,
        !!legacyRender,
        strictStyleIsolation,
        scopedCSS,
        () => initialAppWrapperElement,
    );

    let global = globalContext;  /* window */
    let mountSandbox = () => Promise.resolve();
    let unmountSandbox = () => Promise.resolve();
    const useLooseSandbox = typeof sandbox === 'object' && !!sandbox.loose;
    const speedySandbox = typeof sandbox === 'object' ? sandbox.speedy !== false : true;
    let sandboxContainer;
    if (sandbox) {
        /* 生成应用运行的时的沙箱环境 */
        /* 
        sandboxContainer = {
            instance: {  // 沙箱sandbox
                document：document, 就是当前window下的document
                globalContext: window, 就是createSandboxContainer函数传入的global
                latestSetProp:  , 最后设置属性？
                name: app-vue-history , 就是createSandboxContainer函数传入的appInstanceId
                proxy: ,
                sandboxRunning: true, 沙箱启动正在运行
                type: "Proxy", 支持 Proxy 的浏览器
                updatedValueSet: {size:0} Set属性
            }
            mount: () => {}
            unmount: () => {}
        }
        */

        sandboxContainer = createSandboxContainer(
            appInstanceId, // app-vue-history
            initialAppWrapperGetter,
            scopedCSS,  // false
            useLooseSandbox, // false 使用低级的沙箱 为了兼容性
            excludeAssetFilter,
            global,  // window
            speedySandbox, //true
        );

        /* 研究一下sandboxContainer.instance.proxy到底被定义为了什么？？？ */
        global = sandboxContainer.instance.proxy; /* 将global改为沙箱容器中被proxy代理的假window对象(fakeWindow) */
        /* 沙箱挂载 */
        mountSandbox = sandboxContainer.mount;
        /* 沙箱卸载 */
        unmountSandbox = sandboxContainer.unmount;
        console.log('🚀 ~ sandboxContainer:', sandboxContainer);
    }

    /* 
    global: 沙箱容器中被proxy代理的假window对象(fakeWindow)
    assetPublicPath：http://localhost:2222/ 子应用地址
    lifeCycles：子应用生命周期
    此方法会整合 
    {
        "beforeLoad": [
            ƒ beforeLoad(),
            ƒ beforeLoad()
        ],
        "beforeMount": [
            ƒ beforeMount(),
            ƒ beforeMount()
        ],
        "beforeUnmount": [
            ƒ beforeUnmount(),
            ƒ beforeUnmount()
        ]
    }
    */
    const {
        beforeUnmount = [],
        afterUnmount = [],
        afterMount = [],
        beforeMount = [],
        beforeLoad = [],
    } = mergeWith({}, getAddOns(global, assetPublicPath), lifeCycles, (v1, v2) => concat(v1 ?? [], v2 ?? []));

    /* 
    global: 沙箱容器中被proxy代理的假window对象(fakeWindow)
     此方法执行会给global 新增属性
    {
        __INJECTED_PUBLIC_PATH_BY_QIANKUN__ :  "http://localhost:2222/" , 就是传入的assetPublicPath
        __POWERED_BY_QIANKUN__ : true

    }
    */
    await execHooksChain(toArray(beforeLoad), app, global);

    /* 调试代码：查看execHooksChain执行后当前沙箱容器中被proxy代理的假window对象(fakeWindow) 新赋的属性 */
    console.log('🚀 ~ execHooksChain ~ global:', global)

    /* 执行子应用的js文件，获取js的导出的{ bootstrap, mount, unmount }生命周期函数 */
    const scriptExports = await execScripts(global, sandbox && !useLooseSandbox, {
        scopedGlobalVariables: speedySandbox ? cachedGlobals : [],
    });
    console.log('🚀 ~ loadApp ~ scriptExports:', scriptExports)

     /* 调试代码：查看execScripts执行当前沙箱容器中被proxy代理的假window对象(fakeWindow) 新赋的属性 */
     console.log('🚀 ~ execScripts ~ global:', global)

    /* 从子应用的导出获取生命周期 */
    const { bootstrap, mount, unmount, update } = getLifecyclesFromExports(
        scriptExports,
        appName,
        global, // 沙箱容器中被proxy代理的假window对象(fakeWindow)
        sandboxContainer?.instance?.latestSetProp,
    );
    console.log('🚀 ~ loadApp ~ bootstrap:', bootstrap.toString())

    /* 获取子应用状态方法的action */
    const { onGlobalStateChange, setGlobalState, offGlobalStateChange } = getMicroAppStateActions(appInstanceId);

    const syncAppWrapperElement2Sandbox = (element) => (initialAppWrapperElement = element);
    /* 包裹配置 */
    const parcelConfigGetter = (remountContainer = initialContainer) => {
        let appWrapperElement;
        let appWrapperGetter;

        const parcelConfig = {
            name: appInstanceId,
            bootstrap,
            mount: [
                async () => {
                    if (process.env.NODE_ENV === 'development') {
                        const marks = performanceGetEntriesByName(markName, 'mark');
                        if (marks && !marks.length) {
                            performanceMark(markName);
                        }
                    }
                },
                async () => {
                    if ((await validateSingularMode(singular, app)) && prevAppUnmountedDeferred) {
                        return prevAppUnmountedDeferred.promise;
                    }

                    return undefined;
                },
                async () => {
                    appWrapperElement = initialAppWrapperElement;
                    appWrapperGetter = getAppWrapperGetter(
                        appInstanceId,
                        !!legacyRender,
                        strictStyleIsolation,
                        scopedCSS,
                        () => appWrapperElement,
                    );
                },
                async () => {
                    const useNewContainer = remountContainer !== initialContainer;
                    if (useNewContainer || !appWrapperElement) {
                        appWrapperElement = createElement(appContent, strictStyleIsolation, scopedCSS, appInstanceId);
                        syncAppWrapperElement2Sandbox(appWrapperElement);
                    }

                    render({ element: appWrapperElement, loading: true, container: remountContainer }, 'mounting');
                },
                mountSandbox,
                async () => execHooksChain(toArray(beforeMount), app, global),
                async (props) => mount({ ...props, container: appWrapperGetter(), setGlobalState, onGlobalStateChange }),
                async () => render({ element: appWrapperElement, loading: false, container: remountContainer }, 'mounted'),
                async () => execHooksChain(toArray(afterMount), app, global),
                async () => {
                    if (await validateSingularMode(singular, app)) {
                        prevAppUnmountedDeferred = new Deferred();
                    }
                },
                async () => {
                    if (process.env.NODE_ENV === 'development') {
                        const measureName = `[qiankun] App ${appInstanceId} Loading Consuming`;
                        performanceMeasure(measureName, markName);
                    }
                },
            ],
            unmount: [
                async () => execHooksChain(toArray(beforeUnmount), app, global),
                async (props) => unmount({ ...props, container: appWrapperGetter() }),
                unmountSandbox,
                async () => execHooksChain(toArray(afterUnmount), app, global),
                async () => {
                    render({ element: null, loading: false, container: remountContainer }, 'unmounted');
                    offGlobalStateChange(appInstanceId);
                    appWrapperElement = null;
                    syncAppWrapperElement2Sandbox(appWrapperElement);
                },
                async () => {
                    if ((await validateSingularMode(singular, app)) && prevAppUnmountedDeferred) {
                        prevAppUnmountedDeferred.resolve();
                    }
                },
            ],
        };

        if (typeof update === 'function') {
            parcelConfig.update = update;
        }

        return parcelConfig;
    };


    console.log('🚀 loadApp ~ parcelConfigGetter:', parcelConfigGetter);
    return parcelConfigGetter;
}
