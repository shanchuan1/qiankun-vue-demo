/* qiankunAPi  */
import { registerMicroApps, start } from "./qiankun/qiankunjs";
import store from "./store";

/* 路由注册子应用 
1. 子应用只有在activeRule对应的路由地址才会被触发加载拉取渲染挂载，如果是：http://localhost:8080/ 并不会有子应用的动作

*/
registerMicroApps([
  // {
  //   name: 'app-vue-hash',
  //   entry: 'http://localhost:1111',
  //   container: '#appContainer',
  //   // container: '#app',
  //   activeRule: '/app-vue-hash',
  //   props: { data : { store, router } }
  // },
  {
    name: "app-vue-history",
    entry: "http://localhost:2222",
    container: "#appContainer",
    // container: '#app',
    activeRule: "/app-vue-history",
    props: { data: store },
  },
]);

console.log("监听url地址11111");
/* 修改地址，监听历史记录 
  1. 如果是手动对浏览器窗口地址修改的话，那么这个onpopstate事件不会被触发
  2. 如果是使用pushState，replaceState对url地址修改的话，那么事件会被触发(vue-router原理就是这两个api)
  */
// window.onpopstate = function (popstateEvent) {
//   console.log('🚀 ~ popstateEvent:', popstateEvent)
//   alert(
//     "location: " +
//       window.location +
//       ", state: " +
//       JSON.stringify(popstateEvent.state) +
//       JSON.stringify(popstateEvent.type) 
//   );
// };
// 监听 popstate 事件
window.addEventListener('popstate', function(event) {
    console.log('🚀 ~ window.addEventListener ~ event:', event)
    console.log((
        "location: " +
          window.location +
          ", state: " +
          JSON.stringify(popstateEvent.state) +
          JSON.stringify(popstateEvent.type) 
      ));
  });
/* 
  history.pushState触发onpopstate事件
*/
// history.pushState({page: 1}, "title 1", "/main?page=1");



/* start其实也是single-spa的start这个api二次封装的
一、拦截改造History的API（主要是监听改造hashchange popstate）这个两个事件
   1. 
二、路由重导

*/
start();
