/*
 * @Author: zhongqifeng 1121021693@qq.com
 * @Date: 2024-02-26 16:14:34
 * @LastEditors: zhongqifeng 1121021693@qq.com
 * @LastEditTime: 2024-02-27 14:43:27
 * @FilePath: \qiankun-vue-demo\main\src\qiankunjs\API\prefetchApps.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { importEntry } from 'import-html-entry';


/*
requestIdleCallback 是浏览器提供的一个API，用于在浏览器空闲时执行任务，以便降低对主线程的影响，从而提高页面的性能。
*/
// RIC and shim for browsers setTimeout() without it idle
let requestIdleCallback = (cb) => {};
if (typeof window.requestIdleCallback !== 'undefined') {
  requestIdleCallback = window.requestIdleCallback;
} else if (typeof window.MessageChannel !== 'undefined') {
  /*
  如果requestIdleCallback不支持
  则尝试使用 MessageChannel 来模拟实现一个。
  具体来说，如果浏览器支持 MessageChannel，则创建一个 MessageChannel 实例
  ，通过 port.postMessage() 发送消息，然后在 channel.port1.onmessage 中接收消息并执行任务。

  */
  // The first recommendation is to use MessageChannel because
  // it does not have the 4ms delay of setTimeout
  const channel = new MessageChannel();
  const port = channel.port2;
  const tasks = [];
  channel.port1.onmessage = ({ data }) => {
    const task = tasks.shift();
    if (!task) {
      return;
    }
    idleCall(task, data.start);
  };
  requestIdleCallback = function(cb) {
    tasks.push(cb);
    port.postMessage({ start: Date.now() });
  };
} else {
  requestIdleCallback = (cb) => setTimeout(idleCall, 0, cb, Date.now());
}

export const prefetchApps = async() => {
  const entry = 'http://localhost:2222'
  const opts = {}
  /* 重点是importEntry做了哪些工作？ 返回了拉取js与css文件的函数 */
  const { template, execScripts, assetPublicPath, getExternalScripts, getExternalStyleSheets } = await importEntry(entry, opts);
  // console.log('🚀 ~ prefetchApps ~ assetPublicPath:', assetPublicPath)
  // console.log('🚀 ~ prefetchApps ~ execScripts:', execScripts)
  // console.log('🚀 ~ prefetchApps ~ template:', template)
  requestIdleCallback(getExternalStyleSheets)
  requestIdleCallback(getExternalScripts)

  
}