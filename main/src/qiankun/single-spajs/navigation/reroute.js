import CustomEvent from "custom-event";
import { isStarted } from "../start.js";
import { toLoadPromise } from "../lifecycles/load.js";
import { toBootstrapPromise } from "../lifecycles/bootstrap.js";
import { toMountPromise } from "../lifecycles/mount.js";
import { toUnmountPromise } from "../lifecycles/unmount.js";
import {
  getAppStatus,
  getAppChanges,
  getMountedApps,
} from "../applications/apps.js";
import {
  callCapturedEventListeners,
  originalReplaceState,
} from "./navigation-events.js";
import { toUnloadPromise } from "../lifecycles/unload.js";
import {
  toName,
  shouldBeActive,
  NOT_MOUNTED,
  MOUNTED,
  NOT_LOADED,
  SKIP_BECAUSE_BROKEN,
} from "../applications/app.helpers.js";
import { assign } from "../utils/assign.js";
import { isInBrowser } from "../utils/runtime-environment.js";
import { formatErrorMessage } from "../applications/app-errors.js";
import { addProfileEntry } from "../devtools/profiler.js";

const __DEV__ = true
const __PROFILE__ = true

let appChangeUnderway = false,
  peopleWaitingOnAppChange = [],
  currentUrl = isInBrowser && window.location.href;

export function triggerAppChange() {
  // Call reroute with no arguments, intentionally
  return reroute();
}
export function reroute(
  pendingPromises = [],
  eventArguments,
  silentNavigation = false
) {
  if (appChangeUnderway) {
    console.log('🚀 ~ appChangeUnderway', appChangeUnderway)
    /* 
    路由注册子应用场景：子应用已经 start了 同时子应用加载流程走完会将appChangeUnderway重新赋值为false，所以，只有在非子应用的路由场景下才会执行
    手动加载子应用场景： 子应用未调用卸载前都会执行
    */
    return new Promise((resolve, reject) => {
      peopleWaitingOnAppChange.push({
        resolve,
        reject,
        eventArguments,
      });
    });
  }

  let startTime, profilerKind;

  if (__PROFILE__) {
    startTime = performance.now();
    if (silentNavigation) {
      profilerKind = "silentNavigation";
    } else if (eventArguments) {
      profilerKind = "browserNavigation";
    } else {
      profilerKind = "triggerAppChange";
    }
  }

  /* 获取注册的子应用的当前的状态change （卸载，准备卸载，准备挂载， 挂载） */
  const { appsToUnload, appsToUnmount, appsToLoad, appsToMount } =
    getAppChanges();
  console.log('🚀 ~ appsToUnload, appsToUnmount, appsToLoad, appsToMount:', appsToUnload, appsToUnmount, appsToLoad, appsToMount)

  let appsThatChanged,
    cancelPromises = [],
    oldUrl = currentUrl,
    newUrl = (currentUrl = window.location.href);
    
  console.log('🚀 ~ isStarted():', isStarted())
  if (isStarted()) {
    /* 注册子应用后已经执行了start */
    appChangeUnderway = true;
    appsThatChanged = appsToUnload.concat(
      appsToLoad,
      appsToUnmount,
      appsToMount
    );
    return performAppChanges();
  } else {
    /* 注册子应用后还未执行start */
    appsThatChanged = appsToLoad;
    return loadApps();
  }


  function cancelNavigation(val = true) {
    const promise =
      typeof val?.then === "function" ? val : Promise.resolve(val);
    cancelPromises.push(
      promise.catch((err) => {
        console.warn(
          Error(
            formatErrorMessage(
              42,
              __DEV__ &&
                `single-spa: A cancelNavigation promise rejected with the following value: ${err}`
            )
          )
        );
        console.warn(err);

        // Interpret a Promise rejection to mean that the navigation should not be canceled
        return false;
      })
    );
  }

  function loadApps() {
    return Promise.resolve().then(() => {
      const loadPromises = appsToLoad.map(toLoadPromise);
      let succeeded;

      return (
        Promise.all(loadPromises)
          .then(callAllEventListeners)
          // there are no mounted apps, before start() is called, so we always return []
          .then(() => {
            if (__PROFILE__) {
              succeeded = true;
            }

            return [];
          })
          .catch((err) => {
            if (__PROFILE__) {
              succeeded = false;
            }

            callAllEventListeners();
            throw err;
          })
          .finally(() => {
            if (__PROFILE__) {
              addProfileEntry(
                "routing",
                "loadApps",
                profilerKind,
                startTime,
                performance.now(),
                succeeded
              );
            }
          })
      );
    });
  }


/* 
1. 派发两个事件fireSingleSpaEvent，通知全局目前进度流程(全局可监听访问，对应时机做对应的处理)
2. 先将需要卸载的apps执行完
3. 

*/
  function performAppChanges() {
    return Promise.resolve().then(() => {
      // https://github.com/single-spa/single-spa/issues/545
      fireSingleSpaEvent(
        appsThatChanged.length === 0
          ? "before-no-app-change"
          : "before-app-change",
        getCustomEventDetail(true)
      );

      fireSingleSpaEvent(
        "before-routing-event",
        getCustomEventDetail(true, { cancelNavigation })
      );

      return Promise.all(cancelPromises).then((cancelValues) => {
        const navigationIsCanceled = cancelValues.some((v) => v);

        if (navigationIsCanceled) {
          // Change url back to old url, without triggering the normal single-spa reroute
          originalReplaceState.call(
            window.history,
            history.state,
            "",
            oldUrl.substring(location.origin.length)
          );

          // Single-spa's internal tracking of current url needs to be updated after the url change above
          currentUrl = location.href;

          // necessary for the reroute function to know that the current reroute is finished
          appChangeUnderway = false;

          if (__PROFILE__) {
            addProfileEntry(
              "routing",
              "navigationCanceled",
              profilerKind,
              startTime,
              performance.now(),
              true
            );
          }

          // Tell single-spa to reroute again, this time with the url set to the old URL
          return reroute(pendingPromises, eventArguments, true);
        }

        const unloadPromises = appsToUnload.map(toUnloadPromise);
        console.log('🚀 ~ returnPromise.all ~ unloadPromises:', unloadPromises)

        /* appsToUnmount：准备卸载的app数组 循环去卸载 最终返回卸载成功的异步结果值*/
        const unmountUnloadPromises = appsToUnmount
          .map(toUnmountPromise)
          .map((unmountPromise) => unmountPromise.then(toUnloadPromise));

        const allUnmountPromises = unmountUnloadPromises.concat(unloadPromises);

        const unmountAllPromise = Promise.all(allUnmountPromises);

        let unmountFinishedTime;

        unmountAllPromise.then(
          (unmountAllPromiseValue) => {
            /* 做调试查看卸载的app */
            console.log('🚀 ~ returnPromise.all ~ unmountAllPromiseValue:', unmountAllPromiseValue)
            if (__PROFILE__) {
              unmountFinishedTime = performance.now();

              addProfileEntry(
                "routing",
                "unmountAndUnload",
                profilerKind,
                startTime,
                performance.now(),
                true
              );
            }
            fireSingleSpaEvent(
              "before-mount-routing-event",
              getCustomEventDetail(true)
            );
          },
          (err) => {
            if (__PROFILE__) {
              addProfileEntry(
                "routing",
                "unmountAndUnload",
                profilerKind,
                startTime,
                performance.now(),
                true
              );
            }

            throw err;
          }
        );

        /* We load and bootstrap apps while other apps are unmounting, but we
         * wait to mount the app until all apps are finishing unmounting
         * 当其他app卸载时，加载app 
         * 当其他app完成卸载的时候，才会挂载这个app
         */
        const loadThenMountPromises = appsToLoad.map((app) => {
          /* toLoadPromise ： 将子应用拉取挂载完dom容器后，并且把子应用的生命周期的一些信息与方法暴露出来，便于控制 */
          return toLoadPromise(app).then((app) =>
            tryToBootstrapAndMount(app, unmountAllPromise)
          );
        });
        console.log('🚀 ~ loadThenMountPromises ~ loadThenMountPromises:', loadThenMountPromises)

        /* These are the apps that are already bootstrapped and just need
         * to be mounted. They each wait for all unmounting apps to finish up
         * before they mount.
         * 这些应用程序已经启动，只需要
         * 待安装。他们每个人都在等待所有卸载的应用程序完成
         * 在它们安装之前。
         */
        const mountPromises = appsToMount
          .filter((appToMount) => appsToLoad.indexOf(appToMount) < 0)
          .map((appToMount) => {
            return tryToBootstrapAndMount(appToMount, unmountAllPromise);
          });
        console.log('🚀 ~ returnPromise.all ~ mountPromises:', mountPromises)
        
        return unmountAllPromise
          .catch((err) => {
            callAllEventListeners();
            throw err;
          })
          .then((unmountAllPromiseValue2) => {
            /* Now that the apps that needed to be unmounted are unmounted, their DOM navigation
             * events (like hashchange or popstate) should have been cleaned up. So it's safe
             * to let the remaining captured event listeners to handle about the DOM event.
             */
            callAllEventListeners();
            /* 做调试查看卸载的app2 */
            console.log('🚀 ~ returnPromise.all ~ unmountAllPromiseValue2:', unmountAllPromiseValue2)

            return Promise.all(loadThenMountPromises.concat(mountPromises))
              .catch((err) => {
                pendingPromises.forEach((promise) => promise.reject(err));
                throw err;
              })
              .then((loadThenMountPromisesValue) => {
                 /* 做调试查看需要加载的app */
                console.log('🚀 ~ .then ~ loadThenMountPromisesValue:', loadThenMountPromisesValue)
                return  finishUpAndReturn()
              })
              .then(
                () => {
                  if (__PROFILE__) {
                    addProfileEntry(
                      "routing",
                      "loadAndMount",
                      profilerKind,
                      unmountFinishedTime,
                      performance.now(),
                      true
                    );
                  }
                },
                (err) => {
                  if (__PROFILE__) {
                    addProfileEntry(
                      "routing",
                      "loadAndMount",
                      profilerKind,
                      unmountFinishedTime,
                      performance.now(),
                      false
                    );
                  }

                  throw err;
                }
              );
          });
      });
    });
  }

  function finishUpAndReturn() {
    /*  */
    const returnValue = getMountedApps();
    pendingPromises.forEach((promise) => promise.resolve(returnValue));

    try {
      const appChangeEventName =
        appsThatChanged.length === 0 ? "no-app-change" : "app-change";
      fireSingleSpaEvent(appChangeEventName, getCustomEventDetail());
      fireSingleSpaEvent("routing-event", getCustomEventDetail());
    } catch (err) {
      /* We use a setTimeout because if someone else's event handler throws an error, single-spa
       * needs to carry on. If a listener to the event throws an error, it's their own fault, not
       * single-spa's.
       */
      setTimeout(() => {
        throw err;
      });
    }

    /* Setting this allows for subsequent calls to reroute() to actually perform
     * a reroute instead of just getting queued behind the current reroute call.
     * We want to do this after the mounting/unmounting is done but before we
     * resolve the promise for the `reroute` function.
     * 设置此选项允许后续对reroute（）的调用实际执行
     * 重新路由，而不仅仅是在当前重新路由调用后面排队。
     * 我们希望在安装/卸载完成后但在
     * 实现“重新路由”功能的承诺。
     */
    appChangeUnderway = false;

    if (peopleWaitingOnAppChange.length > 0) {
      console.log('🚀 ~ finishUpAndReturn ~ peopleWaitingOnAppChange:', peopleWaitingOnAppChange)
      /* While we were rerouting, someone else triggered another reroute that got queued.
       * So we need reroute again.
       */
      const nextPendingPromises = peopleWaitingOnAppChange;
      peopleWaitingOnAppChange = [];
      reroute(nextPendingPromises);
    }

    return returnValue;
  }

  /* We need to call all event listeners that have been delayed because they were
   * waiting on single-spa. This includes haschange and popstate events for both
   * the current run of performAppChanges(), but also all of the queued event listeners.
   * We want to call the listeners in the same order as if they had not been delayed by
   * single-spa, which means queued ones first and then the most recent one.
   */
  function callAllEventListeners() {
    // During silent navigation (when navigation was canceled and we're going back to the old URL),
    // we should not fire any popstate / hashchange events
    if (!silentNavigation) {
      pendingPromises.forEach((pendingPromise) => {
        callCapturedEventListeners(pendingPromise.eventArguments);
      });

      callCapturedEventListeners(eventArguments);
    }
  }

  function getCustomEventDetail(isBeforeChanges = false, extraProperties) {
    const newAppStatuses = {};
    const appsByNewStatus = {
      // for apps that were mounted
      [MOUNTED]: [],
      // for apps that were unmounted
      [NOT_MOUNTED]: [],
      // apps that were forcibly unloaded
      [NOT_LOADED]: [],
      // apps that attempted to do something but are broken now
      [SKIP_BECAUSE_BROKEN]: [],
    };

    if (isBeforeChanges) {
      appsToLoad.concat(appsToMount).forEach((app, index) => {
        addApp(app, MOUNTED);
      });
      appsToUnload.forEach((app) => {
        addApp(app, NOT_LOADED);
      });
      appsToUnmount.forEach((app) => {
        addApp(app, NOT_MOUNTED);
      });
    } else {
      appsThatChanged.forEach((app) => {
        addApp(app);
      });
    }

    const result = {
      detail: {
        newAppStatuses,
        appsByNewStatus,
        totalAppChanges: appsThatChanged.length,
        originalEvent: eventArguments?.[0],
        oldUrl,
        newUrl,
      },
    };

    if (extraProperties) {
      assign(result.detail, extraProperties);
    }
    // isStarted() && console.log('🚀 ~ getCustomEventDetail ~ result:', result)

    return result;

    function addApp(app, status) {
      const appName = toName(app);
      status = status || getAppStatus(appName);
      newAppStatuses[appName] = status;
      const statusArr = (appsByNewStatus[status] =
        appsByNewStatus[status] || []);
      statusArr.push(appName);
    }
  }

  function fireSingleSpaEvent(name, eventProperties) {
    // During silent navigation (caused by navigation cancelation), we should not
    // fire any single-spa events
    if (!silentNavigation) {
      window.dispatchEvent(
        new CustomEvent(`single-spa:${name}`, eventProperties)
      );
    }
  }
}

/**
 * Let's imagine that some kind of delay occurred during application loading.
 * The user without waiting for the application to load switched to another route,
 * this means that we shouldn't bootstrap and mount that application, thus we check
 * twice if that application should be active before bootstrapping and mounting.
 * https://github.com/single-spa/single-spa/issues/524
 * 
 *  让我们想象一下，在应用程序加载过程中发生了某种延迟。
    用户在不等待应用加载的情况下切换到另一个路由，
    这意味着我们不应该引导和装载该应用程序，因此我们检查
    两次，如果该应用程序在引导和装载之前应该处于活动状态。
 */
function tryToBootstrapAndMount(app, unmountAllPromise) {
  if (shouldBeActive(app)) {
    /* toBootstrapPromise： 执行子应用的生命周期函数 bootstrap*/
    return toBootstrapPromise(app).then((app) =>
      unmountAllPromise.then(() =>
       /* toMountPromise 执行子应用的生命周期函数 mount*/
       shouldBeActive(app) ? toMountPromise(app) : app
      )
    );
  } else {
    return unmountAllPromise.then(() => app);
  }
}
