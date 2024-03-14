/* qiankunAPi  */
import {prefetchAppsFn, loadMicroApp} from './qiankun/qiankunjs'
import store from "./store";



/* ------------------------------------------ 手动加载微应用 ----------------------------------------- */
/* 
entry: 微应用的访问地址,必须是服务启动的地址
地址的内容资源会被importHTML拉取加载

*/

/* 预加载 微应用*/
// prefetchApps([
//   // { name: 'app-vue-hash', entry: 'http://localhost:1111' },
//   { name: 'app-vue-history', entry: 'http://localhost:2222' },
// ]);

// prefetchAppsFn()




/* 手动加载微应用 */
// loadMicroApp(
//   {
//     name: "app-vue-hash",
//     entry: "//localhost:1111",
//     container: "#appContainer",
//     // container: '#app',
//     // activeRule: "/app-vue-hash",
//     props: { data: { store, router } },
//   },
// );

window.loadAppInstance = loadMicroApp(
  {
    name: "app-vue-history",
    entry: "//localhost:2222",
    container: "#appContainer",
    // container: '#app',
    // activeRule: '/app-vue-history',
    props: { data: store },
  },
)
