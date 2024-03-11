import { isBoundedFunction, isCallable, isConstructable } from '../utils';

let currentRunningApp = null;

/**
 * 获取当前时刻正在运行任务的应用程序
 */
export function getCurrentRunningApp() {
  return currentRunningApp;
}

/**
 * 设置当前运行的应用程序
 * @param appInstance 应用程序实例对象
 */
export function setCurrentRunningApp(appInstance) {
  // 将当前运行的应用程序及其代理沙箱设置为全局 window 对象，因为它的唯一用途是从现在开始的 document.createElement 被全局方式劫持
  currentRunningApp = appInstance;
  console.log('🚀 ~ setCurrentRunningApp ~ currentRunningApp:', currentRunningApp)
}

/**
 * 清除当前运行的应用程序
 */
export function clearCurrentRunningApp() {
  currentRunningApp = null;
}

const functionBoundedValueMap = new WeakMap();

/**
 * 将目标重新绑定到函数上
 * @param target 目标对象
 * @param fn 函数对象
 * @returns 绑定后的函数对象
 */
export function rebindTarget2Fn(target, fn) {
  if (isCallable(fn) && !isBoundedFunction(fn) && !isConstructable(fn)) {
    const cachedBoundFunction = functionBoundedValueMap.get(fn);
    if (cachedBoundFunction) {
      return cachedBoundFunction;
    }
    const boundValue = Function.prototype.bind.call(fn, target);
    Object.getOwnPropertyNames(fn).forEach((key) => {
      if (!boundValue.hasOwnProperty(key)) {
        Object.defineProperty(boundValue, key, Object.getOwnPropertyDescriptor(fn, key));
      }
    });
    if (fn.hasOwnProperty('prototype') && !boundValue.hasOwnProperty('prototype')) {
      Object.defineProperty(boundValue, 'prototype', { value: fn.prototype, enumerable: false, writable: true });
    }
    if (typeof fn.toString === 'function') {
      const valueHasInstanceToString = fn.hasOwnProperty('toString') && !boundValue.hasOwnProperty('toString');
      const boundValueHasPrototypeToString = boundValue.toString === Function.prototype.toString;
      if (valueHasInstanceToString || boundValueHasPrototypeToString) {
        const originToStringDescriptor = Object.getOwnPropertyDescriptor(valueHasInstanceToString ? fn : Function.prototype, 'toString');
        Object.defineProperty(
          boundValue,
          'toString',
          Object.assign(
            {},
            originToStringDescriptor,
            originToStringDescriptor?.get ? null : { value: () => fn.toString() },
          ),
        );
      }
    }
    functionBoundedValueMap.set(fn, boundValue);
    return boundValue;
  }
  return fn;
}
