import { importEntry } from 'import-html-entry';
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

    await getExternalScripts();
 
    if (await validateSingularMode(singular, app)) {
        await (prevAppUnmountedDeferred && prevAppUnmountedDeferred.promise);
    }

    /* 
    将importEntry拉取的子应用的index.html组装成挂载在主应用的dom模板===》》》》字符串
    即：将微应用dom最外层包裹qiankun标识的div，子级为微应用的index.html内容
    标识如：<div id="__qiankun_microapp_wrapper_for_app_vue_history__" data-name="app-vue-history" data-version="2.10.16" data-sandbox-cfg=true>
    appContent内容为字符串
    */
    const appContent = getDefaultTplWrapper(appInstanceId, sandbox)(template);
    console.log('🚀 ~ appContent:', appContent);

    const strictStyleIsolation = typeof sandbox === 'object' && !!sandbox.strictStyleIsolation;
    console.log('🚀 ~ loadApp ~ strictStyleIsolation:', strictStyleIsolation)
    const scopedCSS = isEnableScopedCSS(sandbox);
    console.log('🚀 ~ scopedCSS:', scopedCSS);
    /* 转为真实dom */
    let initialAppWrapperElement = createElement(appContent, strictStyleIsolation, scopedCSS, appInstanceId);
    console.log('🚀 ~ loadApp ~ initialAppWrapperElement:', initialAppWrapperElement)

    const initialContainer = 'container' in app ? app.container : undefined;
    const legacyRender = 'render' in app ? app.render : undefined;

    const render = getRender(appInstanceId, appContent, legacyRender);
    console.log('🚀 ~ loadApp ~ render:', render)

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
        sandboxContainer = createSandboxContainer(
            appInstanceId,
            initialAppWrapperGetter,
            scopedCSS,
            useLooseSandbox,
            excludeAssetFilter,
            global,
            speedySandbox,
        );
        global = sandboxContainer.instance.proxy; /* 将window的全局改为子应用沙箱容器的proxy */
        mountSandbox = sandboxContainer.mount;
        unmountSandbox = sandboxContainer.unmount;
        console.log('🚀 ~ sandboxContainer:', sandboxContainer);
    }

    const {
        beforeUnmount = [],
        afterUnmount = [],
        afterMount = [],
        beforeMount = [],
        beforeLoad = [],
    } = mergeWith({}, getAddOns(global, assetPublicPath), lifeCycles, (v1, v2) => concat(v1 ?? [], v2 ?? []));

    console.log('🚀 ~ loadApp ~ beforeLoad:', beforeLoad)

    await execHooksChain(toArray(beforeLoad), app, global);

    /* 执行子应用的js文件，获取js的导出的{ bootstrap, mount, unmount }生命周期函数 */
    const scriptExports = await execScripts(global, sandbox && !useLooseSandbox, {
        scopedGlobalVariables: speedySandbox ? cachedGlobals : [],
    });
    console.log('🚀 ~ loadApp ~ scriptExports:', scriptExports)

    /* 从子应用的导出获取生命周期 */
    const { bootstrap, mount, unmount, update } = getLifecyclesFromExports(
        scriptExports,
        appName,
        global,
        sandboxContainer?.instance?.latestSetProp,
    );
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
