import { find } from "../utils/find.js";
import { objectType, toName } from "../applications/app.helpers.js";
import { formatErrorMessage } from "../applications/app-errors.js";

export function validLifecycleFn(fn) {
  return fn && (typeof fn === "function" || isArrayOfFns(fn));

  function isArrayOfFns(arr) {
    return (
      Array.isArray(arr) && !find(arr, (item) => typeof item !== "function")
    );
  }
}


/* 
函数接受两个参数：appOrParcel 表示应用程序或者 parcel 对象，lifecycle 表示生命周期函数名称。

首先从 appOrParcel 对象中获取对应生命周期的函数数组 fns，如果该数组不存在，则初始化为空数组。
然后判断 fns 是否为数组，如果不是数组，则将其转换为数组形式，以便后续处理。
如果 fns 数组为空，则添加一个返回空 Promise 的函数到数组中，保证不会出现空数组的情况。
接着获取 appOrParcel 对象的类型和名称，用于后续错误信息的提示。
返回一个函数，这个函数接受一个参数 props，表示生命周期函数需要的参数。这个函数的作用是执行生命周期函数数组中的函数，并且保证按顺序执行，并且确保每个函数返回一个 Promise。
在返回的函数中，使用 reduce 方法遍历生命周期函数数组 fns，初始值为一个 resolved 状态的 Promise。
对于数组中的每个函数 fn，使用 then 方法依次执行。如果 fn 返回的结果是一个 Promise，则直接返回该 Promise；如果不是一个 Promise，则返回一个 rejected 状态的 Promise，并且抛出错误信息，指示在数组中的位置出现了非 Promise 类型的函数。
最终返回一个 Promise，表示所有生命周期函数的执行结果。

这段代码的核心功能是将应用程序或 parcel 对象上的生命周期函数数组展开并按顺序执行，保证每个函数返回一个 Promise，并且能够处理错误情况
*/

export function flattenFnArray(appOrParcel, lifecycle) {
  let fns = appOrParcel[lifecycle] || [];
  fns = Array.isArray(fns) ? fns : [fns];
  if (fns.length === 0) {
    fns = [() => Promise.resolve()];
  }

  const type = objectType(appOrParcel);
  const name = toName(appOrParcel);

  return function (props) {
    return fns.reduce((resultPromise, fn, index) => {
      return resultPromise.then(() => {
        const thisPromise = fn(props);
        return smellsLikeAPromise(thisPromise)
          ? thisPromise
          : Promise.reject(
              formatErrorMessage(
                15,
                __DEV__ &&
                  `Within ${type} ${name}, the lifecycle function ${lifecycle} at array index ${index} did not return a promise`,
                type,
                name,
                lifecycle,
                index
              )
            );
      });
    }, Promise.resolve());
  };
}

/* ToDo: 测试 */
const appOrParcel = {
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
}
const lifecycle = 'mount'
// const res = flattenFnArray(appOrParcel, lifecycle)
// console.log('🚀 ~ res:', res)



export function smellsLikeAPromise(promise) {
  return (
    promise &&
    typeof promise.then === "function" &&
    typeof promise.catch === "function"
  );
}
