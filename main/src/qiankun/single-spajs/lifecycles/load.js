import {
  LOAD_ERROR,
  NOT_BOOTSTRAPPED,
  LOADING_SOURCE_CODE,
  SKIP_BECAUSE_BROKEN,
  NOT_LOADED,
  objectType,
  toName,
} from "../applications/app.helpers.js";
import { ensureValidAppTimeouts } from "../applications/timeouts.js";
import {
  handleAppError,
  formatErrorMessage,
} from "../applications/app-errors.js";
import {
  flattenFnArray,
  smellsLikeAPromise,
  validLifecycleFn,
} from "./lifecycle.helpers.js";
import { getProps } from "./prop.helpers.js";
import { assign } from "../utils/assign.js";
import { addProfileEntry } from "../devtools/profiler.js";

const __PROFILE__ = true



/* 
appOrParcel.loadApp()
调用qiankun注册子应用registerApplication传入的loadApp函数
        这个时候就会去拉取资源并挂载好dom容器了

最后给appOrParcel组装挂载新属性返回 ，并且删除appOrParcel.loadPromise属性
  appOrParcel = {
                  ...appOrParcel,
                  status : NOT_BOOTSTRAPPED;   // 修改状态
                  bootstrap : flattenFnArray(appOpts, "bootstrap");  // appOpts为loadAPP调用后返回的值
                  mount : flattenFnArray(appOpts, "mount");
                  unmount : flattenFnArray(appOpts, "unmount");
                  unload : flattenFnArray(appOpts, "unload");
                  timeouts : ensureValidAppTimeouts(appOpts.timeouts);
                }

  appOpts = {
    bootstrap :  ƒ bootstrap()
    mount :  (13) [ƒ, ƒ, ƒ, ƒ, ƒ, ƒ, ƒ, ƒ, ƒ, ƒ, ƒ, ƒ, ƒ]
    name : "app-vue-history"
    unmount : (6) [ƒ, ƒ, ƒ, ƒ, ƒ, ƒ]
  }              
相当于将子应用拉取挂载完dom容器后，并且把子应用的生命周期的一些信息与方法暴露出来，便于控制
*/
export function toLoadPromise(appOrParcel) {
  console.log('🚀 ~ toLoadPromise ~ appOrParcel:', appOrParcel)
  return Promise.resolve().then(() => {
    if (appOrParcel.loadPromise) {
      return appOrParcel.loadPromise;
    }

    if (
      appOrParcel.status !== NOT_LOADED &&
      appOrParcel.status !== LOAD_ERROR
    ) {
      return appOrParcel;
    }

    let startTime;

    if (__PROFILE__) {
      startTime = performance.now();
    }

    appOrParcel.status = LOADING_SOURCE_CODE;

    let appOpts, isUserErr;

    return (appOrParcel.loadPromise = Promise.resolve()
      .then(() => {
        /* 
        appOrParcel.loadApp: 调用的就是qiankun注册子应用registerApplication传入的loadApp函数
        这个时候就会去拉取资源并挂载好dom容器了

       appOrParcel.loadApp为 : async () => {
                                  loader(true);
                                  await frameworkStartedDefer.promise;
                                  const { mount, ...otherMicroAppConfigs } = (
                                      await loadApp({ name, props, ...appConfig }, frameworkConfiguration, lifeCycles)
                                      
                                  )();
                                  return {
                                      mount: [async () => loader(true), ...toArray(mount), async () => loader(false)],
                                      ...otherMicroAppConfigs,
                                  };
        loadPromise : 是异步的一个结果值， 所以需要.then获取到这个结果值对象        
        */
        const loadPromise = appOrParcel.loadApp(getProps(appOrParcel));
        if (!smellsLikeAPromise(loadPromise)) {
          // The name of the app will be prepended to this error message inside of the handleAppError function
          isUserErr = true;
          throw Error(
            formatErrorMessage(
              33,
              __DEV__ &&
                `single-spa loading function did not return a promise. Check the second argument to registerApplication('${toName(
                  appOrParcel
                )}', loadingFunction, activityFunction)`,
              toName(appOrParcel)
            )
          );
        }
        return loadPromise.then((val) => {
          appOrParcel.loadErrorTime = null;

          appOpts = val;

          let validationErrMessage, validationErrCode;

          if (typeof appOpts !== "object") {
            validationErrCode = 34;
            if (__DEV__) {
              validationErrMessage = `does not export anything`;
            }
          }

          if (
            // ES Modules don't have the Object prototype
            Object.prototype.hasOwnProperty.call(appOpts, "bootstrap") &&
            !validLifecycleFn(appOpts.bootstrap)
          ) {
            validationErrCode = 35;
            if (__DEV__) {
              validationErrMessage = `does not export a valid bootstrap function or array of functions`;
            }
          }

          if (!validLifecycleFn(appOpts.mount)) {
            validationErrCode = 36;
            if (__DEV__) {
              validationErrMessage = `does not export a mount function or array of functions`;
            }
          }

          if (!validLifecycleFn(appOpts.unmount)) {
            validationErrCode = 37;
            if (__DEV__) {
              validationErrMessage = `does not export a unmount function or array of functions`;
            }
          }

          const type = objectType(appOpts);

          if (validationErrCode) {
            let appOptsStr;
            try {
              appOptsStr = JSON.stringify(appOpts);
            } catch {}
            console.error(
              formatErrorMessage(
                validationErrCode,
                __DEV__ &&
                  `The loading function for single-spa ${type} '${toName(
                    appOrParcel
                  )}' resolved with the following, which does not have bootstrap, mount, and unmount functions`,
                type,
                toName(appOrParcel),
                appOptsStr
              ),
              appOpts
            );
            handleAppError(
              validationErrMessage,
              appOrParcel,
              SKIP_BECAUSE_BROKEN
            );
            return appOrParcel;
          }

          if (appOpts.devtools && appOpts.devtools.overlays) {
            appOrParcel.devtools.overlays = assign(
              {},
              appOrParcel.devtools.overlays,
              appOpts.devtools.overlays
            );
          }

          appOrParcel.status = NOT_BOOTSTRAPPED;
          appOrParcel.bootstrap = flattenFnArray(appOpts, "bootstrap");
          appOrParcel.mount = flattenFnArray(appOpts, "mount");
          appOrParcel.unmount = flattenFnArray(appOpts, "unmount");
          appOrParcel.unload = flattenFnArray(appOpts, "unload");
          appOrParcel.timeouts = ensureValidAppTimeouts(appOpts.timeouts);

          delete appOrParcel.loadPromise;

          if (__PROFILE__) {
            addProfileEntry(
              "application",
              toName(appOrParcel),
              "load",
              startTime,
              performance.now(),
              true
            );
          }

          return appOrParcel;
        });
      })
      .catch((err) => {
        delete appOrParcel.loadPromise;

        let newStatus;
        if (isUserErr) {
          newStatus = SKIP_BECAUSE_BROKEN;
        } else {
          newStatus = LOAD_ERROR;
          appOrParcel.loadErrorTime = new Date().getTime();
        }
        handleAppError(err, appOrParcel, newStatus);

        if (__PROFILE__) {
          addProfileEntry(
            "application",
            toName(appOrParcel),
            "load",
            startTime,
            performance.now(),
            false
          );
        }

        return appOrParcel;
      }));
  });
}
