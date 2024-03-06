import "whatwg-fetch";
import "custom-event-polyfill";
import "core-js/stable/promise";
import "core-js/stable/symbol";
import "core-js/stable/string/starts-with";
import "core-js/web/url";
import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
// import { registerMicroApps, start, loadMicroApp, prefetchApps  } from "qiankun";

/* qiankunAPi  */
// import {prefetchAppsFn, loadMicroApp} from './qiankunjs'
// import {registerMicroApps, start} from './qiankunjs'


/* 手动加载子应用 */
// import "./handload.js";

/* 路由注册加载子应用 */
import "./routeload.js";



/* 测试API */
// import "./qiankunjs/API/importEntry.js";

Vue.config.productionTip = false;
new Vue({
  router,
  store,
  render: (h) => h(App),
}).$mount("#app");