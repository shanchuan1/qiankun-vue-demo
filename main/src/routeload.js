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
    // entry: "http://localhost:2222",
    entry: "http://localhost:8080/app1",
    container: "#appContainer",
    // container: '#app',
    activeRule: "/app-vue-history",
    props: { data: store },
  },
]);

console.log("-----------------监听url地址-------------------------");
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

/* 
  主应用改写replaceState与pushState事件
*/
// window.history.pushState = () =>{
//   console.log('测试子应用vue-router切换路由是否是调用这个pushState事件');
// }

// window.history.replaceState = () =>{
//   console.log('测试子应用vue-router切换路由是否是调用这个replaceState事件');
// }

// -------------------------------------------------------监听 popstate 事件---------------------------------------------------
/* 
原本的popstate事件被single-spa拦截重写了
外部能监听到的popstate事件，是single-spa重新派发的一个新popstate的事件
single-spa监听的是history.replaceState事件（vue-router的路由切换触发的就是pushState与replaceState事件）
判断两次路由发生了变化如： http://localhost:8080/app-vue-history/about ===> http://localhost:8080/app-vue-history/
便会派发一个新popstate的事件
window.dispatchEvent(createPopStateEvent(window.history.state, methodName));
*/
// 主应用监听到的popstate事件就是被派发的新popstate的事件
// 注意：如果主应用改写了pushState与replaceState事件，那么子应用监听的popstate事件就不是来自与single-spa派发的了
// 浏览器窗口的前进与后退仍然可以触发popstate事件
window.addEventListener('popstate', function(event) {
    console.log('🚀 ~ window.addEventListener ~ event:', event)
    /* 
    event包含single-spa重写派发事件内的标识属性
    {
      singleSpa:true
      singleSpaTrigger: replaceState
    }
    */
    console.log((
        "location: " +
          window.location +
          ", state: " +
          JSON.stringify(event.state) +
          JSON.stringify(event.type) 
      ));
  });
/* 
  history.pushState触发onpopstate事件
*/
// history.pushState({page: 1}, "title 1", "/main?page=1");



/* start其实也是single-spa的start这个api二次封装的
1.拦截改造History的API（主要是监听改造hashchange popstate）这个两个事件
2.路由重导
*/
//  -------------------------------------------------------css样式隔离-----------------------------------------------------------


/* 一、
配置为 { strictStyleIsolation: true } 时表示开启严格的样式隔离模式。
这种模式下 qiankun 会为每个微应用的容器包裹上一个 shadow dom 节点，从而确保微应用的样式不会对全局造成影响。
*/
// start({sandbox:{strictStyleIsolation: true}});

/* 二、
实验性的样式隔离特性，当 experimentalStyleIsolation 被设置为 true 时，
qiankun 会改写子应用所添加的样式为所有样式规则增加一个特殊的选择器规则来限定其影响范围，因此改写后的代码会表达类似为如下结构：
*/
// start({sandbox:{experimentalStyleIsolation: true}});

/* 样式选择器的结构
// 假设应用名是 react16
.app-main {
  font-size: 14px;
}

div[data-qiankun-react16] .app-main {
  font-size: 14px;
}

/* 三、
默认情况下沙箱可以确保单实例场景子应用之间的样式隔离，但是无法确保主应用跟子应用、或者多实例场景的子应用样式隔离
*/
start()



//  --------------------------------------------------主子应用间通信------------------------------------------------
/* 
监听子应用的自定义事件:CustomEvent 
*/
window.addEventListener('custom', function(event) {
  console.log('🚀 ~ window.addEventListener-custom ~ event:', event)
});


/* 
路由式注册
1. 如果registerMicroApps与start都调用了，但是location路由地址未匹配到activeRule: "/app-vue-history"，那么子应用就未被拉取挂载


bug: {
  子应用卸载 /app-vue-history/about 切入主应用的/about  (mabye 主子应用都存在/about的路由，发生了错误)
  会把子应用的/app-vue-history/about路由的内容 渲染到主应用about的容器</router-view>内
}
*/


/* 
/app-vue-history地址 
1. 在子应用是渲染页面，达到局部更新
2. 在父应用是拉取子应用资源（html,js）
*/

/* ---------------------------------------------------路由变化，生命周期变化------------------------------------------------------
1. 父 ==> 子
2. 子 ==> 子 （两个子应用切换）
3. 子应用内部路由切换
从路由/app-vue-history(激活路由)   ===> /app-vue-history/about
single-spa重写的pushState触发重写的popstate事件是全局的，所以pushState事件会被捕获监听，同时开始路由重导reroute()
根据getAppChanges()判断当前/app-vue-history/about路由是在激活路由下，所有子应用的状态仍没有改变为"MOUNTED"，路由匹配+"MOUNTED"状态
使得对子应用不做任何操作，所以子应用内部的路由切换，仅仅是子应用的vue-router实现，没有single-spa拦截的副作用

4. 子 ==> 父
子应用从已挂载到卸载阶段流程:
根据single-spa重写的pushState触发重写的popstate事件，(这个时候路由已经发生改变，离开了与子应用配对的路由),然后触发reroute()
这里首先会调用getAppChanges()判断此子应用下一步的状态，并且推送到对应状态需处理的准备卸载数组(appsToUnmount)
先调用toUnmountPromise函数处理准备卸载的app，同时修改app的状态为SKIP_BECAUSE_BROKEN，最后调用toUnloadPromise函数，返回appOrParcel
最终调用的是qiankun中loadApp函数返回的parcelConfig.unmount函数去卸载，把挂载子应用的目标容器dom的子级元素移除(带有qiankun标识的div)
(可以理解为卸载与挂载能力是qiankun传入提供给single-spa)
最终把appOrParcel.status = NOT_MOUNTED
*/