import './public-path';
import Vue from 'vue';
import VueRouter from 'vue-router';
import App from './App.vue';
import routes from './router';
import store from './store';
import shareA from './components/shareA.vue'

Vue.config.productionTip = false;

let router = null;
let instance = null;

/* 
子应用执行这一步时，
1. 父应用已经将子应用的index.html(已改造好的index.html)挂载在父应用的容器dom，给子应用创造好了运行容器， js脚本也拉取好了
2. 同时子应用需将base的路由地址改造为注册的激活路由地址，此时默认render渲染的就是/app-vue-history路由地址
3. 所有此时调用render就是将vue当页面应用的/app-vue-history路由下的页面渲染到父容器中
4. 同时子应用的所需对应路由的js执行文件也由子应用自身控制(切换不同路由，执行子应用不同的js)

猜测：vueRouter利用的pushState与replace原理改变路由地址以动态局部刷新切换页面的部分，同时qiankun拦截了所有的popstate事件(暂不知作用为何)


*/
function render({ container } = {}) {
  router = new VueRouter({
    /* 判断是否在乾坤架构下的base路由 */
    base: window.__POWERED_BY_QIANKUN__ ? '/app-vue-history' : '/',
    mode: 'history',
    routes,
  });

  instance = new Vue({
    router,
    store,
    render: h => h(App),
    /* 判断是否在乾坤架构下的container容器 */
  }).$mount(container ? container.querySelector('#appVueHistory') : '#appVueHistory');
}

/* 不在qiankun架构，独立运行 */
if (!window.__POWERED_BY_QIANKUN__) {
  render();
}
//测试全局变量污染
window.a = 1;
export async function bootstrap() {
  console.log('vue app bootstraped');
}

export async function mount(props) {
  console.log('props from main framework', props);
  render(props);
  // 测试一下 body 的事件，不会被沙箱移除
  // document.body.addEventListener('click', e => console.log('document.body.addEventListener'))
  // document.body.onclick = e => console.log('document.body.addEventListener')
}

export async function unmount() {
  instance.$destroy();
  instance.$el.innerHTML = "";
  instance = null;
  router = null;
}

/* 
router-link
切换目录路由默认会触发history.pushState事件
*/
/* 
 子应用改写pushState与replaceState
*/
// 点击路由的router-link，确定会触发执行此函数history.pushState，同时此函数会触发popstate事件
// window.history.pushState = () =>{
//   console.log('测试vue-router切换路由是否是调用这个pushState事件');
// }
// 点击路由的router-link，确定会触发执行此函数history.replaceState，同时此函数会触发popstate事件
// window.history.replaceState = () =>{
//   console.log('测试vue-router切换路由是否是调用这个replaceState事件');
// }

// 前提：-----------------------------------在qiankun环境下-------------------------------------------------------------
/* 监听 popstate 事件， 这里原生的监听popstate事件是被single-spa重写了并重写派发了，
类似于
const popstateLister =  window.addEventListener("popstate", fn)

window.addEventListener = function (eventName, fn) { 
  if( eventName === popstate ){
    把原来执行popstate事件的函数暂存
    arr.push(fn)
    
    然后直接不执行
    return
  }
}
重新派发新的popstate事件
window.dispatchEvent(createPopStateEvent(window.history.state, methodName));
*/

// 此时监听popstate事件的就是single-spa派发的，子应用监听也是为了全局统一事件
// 注意：如果子应用改写了pushState与replaceState事件，那么子应用监听的popstate事件就不是来自与single-spa派发的了
// 浏览器窗口的前进与后退仍然可以触发popstate事件
window.addEventListener('popstate', function(event) {
  console.log('🚀 ~ window.addEventListener ~ event:', event)
  console.log((
      "location: " +
        window.location +
        ", state: " +
        JSON.stringify(event.state) +
        JSON.stringify(event.type) +
        JSON.stringify(event.singleSpaTrigger) 
    ));
});



/* 前提： -----------------------------------------独立vue工程----------------------------------------- */
// pushState与replaceState触发popstate事件默认是监听不到的
// vue-router底层拦截重写了这个事件
// const popstateLister =  window.addEventListener("popstate", fn)
// window.addEventListener = function (eventName, fn) { 
//   if( eventName === popstate ){
//     把原来执行popstate事件的函数暂存
//     arr.push(fn)
    
//     然后直接不执行
//     return
//   }
// }
// window.addEventListener = () => {}

// 所以这个事件的监听是不会触发的
window.addEventListener('popstate', function(event) {
  console.log('🚀 ~ window.addEventListener ~ event:', event)
});



/* ------------------------------------------------window ---------------------------------------------------- */
// 子应用与父应用不会共享同一个window，因为避免全局使用同一个window的污染
// 但是因为qiankun把子应用的window使用的属性挂载到了qiankun内部被代理的假window对象fakeWindow
// 所以父应用通过window.proxy可以访问下面定义的属性
// 注意：一定得在子应用在挂载阶段，未挂载与卸载是访问不到的
window.childApp = '张三'
let obj = {
  a: 100,
  b: 200,
  c: 300
}
/* 可在主应用访问调用initApp获取子应用的obj */
window.initApp = () => {
  return obj
}


/* ------------------------------------------------主子应用间通信------------------------------------------------ */
/* 可在主应用监听此事件的派发完成通信 */
const createCustomEvent = (type, props) => {
  let event = document.createEvent("HTMLEvents")
  event.initEvent(type, true, true)
  event.status = '子应用已启动'
 return window.dispatchEvent(Object.assign(event,{...props}))
}
createCustomEvent('custom',  {info: '测试主子应用间通信'})


/* ------------------------------------------------主子应用间跨项目组件共享------------------------------------------------ */
// export const shareComp = (container) => {
//   return new Vue({
//     // store,
//     // i18n,
//     render: h => h(shareA),
//   }).$mount(container);
// }
window.shareComp = (container) => {
  return new Vue({
    // store,
    // i18n,
    render: h => h(shareA),
  }).$mount(container);
}