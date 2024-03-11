# single-spa的生命周期
子应用生命周期包含bootstrap，mount，unmount三个回调函数。主应用在管理子应用的时候，通过子应用暴露的生命周期函数来实现子应用的启动和卸载

load：当应用匹配路由时就会加载脚本（非函数，只是一种状态）。
bootstrap：应用内容首次挂载到页面前调用。
Mount：当主应用判定需要激活这个子应用时会调用, 实现子应用的挂载、页面渲染等逻辑。
unmount：当主应用判定需要卸载这个子应用时会调用, 实现组件卸载、清理事件监听等逻辑。
unload：非必要函数，一般不使用。unload之后会重新启动bootstrap流程



# single-spa将pushState与replaceState重写
```js
window.history.pushState = patchedUpdateState(
    window.history.pushState,
    "pushState"
  );
// 即
window.history.pushState = function (updateState，methodName) {
    const urlBefore = window.location.href;
    const result = updateState.apply(this, arguments);
    const urlAfter = window.location.href;

    if (!urlRerouteOnly || urlBefore !== urlAfter) {
      /* 改变了路由地址，派发一个新的popstate事件 这样新的popstate事件可外面监听调用*/
      window.dispatchEvent(
        createPopStateEvent(window.history.state, methodName) //创建一个新的popstate事件 new PopStateEvent("popstate", { state });
      );
    }
    return result;
};
window.history.replaceState = patchedUpdateState(
    window.history.replaceState,
    "replaceState"
);
// 即
window.history.replaceState = function (updateState，methodName) {
    const urlBefore = window.location.href;
    const result = updateState.apply(this, arguments);
    const urlAfter = window.location.href;

    if (!urlRerouteOnly || urlBefore !== urlAfter) {
      /* 改变了路由地址，派发一个新的popstate事件 这样新的popstate事件可外面监听调用*/
      window.dispatchEvent(
        createPopStateEvent(window.history.state, methodName) //创建一个新的popstate事件 new PopStateEvent("popstate", { state });
      );
    }
    return result;
};
```

## js沙箱(sandbox)
沙箱的创建：
在 qiankun 的代码中，沙箱是通过 sandbox.js 文件实现的。该文件定义了 Sandbox 类，通过调用 new Sandbox() 来创建一个沙箱实例。
沙箱实例是通过 Proxy 对象来封装全局对象（如 window），从而拦截对全局对象的访问，使得微应用无法直接访问到主应用的全局变量。

沙箱的隔离：
沙箱会为每个微应用创建一个独立的上下文环境，确保微应用之间的全局变量和事件不会相互影响。
沙箱会为每个微应用提供一个隔离的全局对象，微应用可以在这个全局对象上定义自己的全局变量和事件，而不会影响其他微应用。

沙箱的代理：
沙箱通过 Proxy 对象代理了全局对象，对于微应用的访问会经过沙箱的拦截和处理。
当微应用试图读取或修改全局变量时，沙箱会根据一定的规则进行拦截和处理，从而确保全局变量不会受到微应用的影响。

沙箱的沙盒化：
沙箱实现了一定程度的沙盒化，对微应用的运行环境进行了隔离和限制，防止微应用对主应用造成不良影响。
沙箱可以限制微应用对全局对象的访问权限，只允许微应用访问或修改特定的全局变量，从而提高安全性。

沙箱的事件机制：
沙箱还实现了一套事件机制，用于在微应用之间进行通信和消息传递。
微应用可以通过事件机制向其他微应用发送消息，从而实现跨应用的数据共享和交互。

沙箱内部全局变量：
在沙箱内部，全局变量通过代理进行拦截。当微应用在沙箱内部创建全局变量时，沙箱会拦截并存储这些变量。这样，即使微应用之间存在相同的全局变量名，它们在沙箱内部仍然是隔离的。

沙箱外部全局变量： 
沙箱会通过监听全局变量的 getter 操作，来获取外部环境中的全局变量，并同步到沙箱内部。这确保了微应用能够访问到在外部环境中定义的全局变量。

事件通信隔离： 
qiankun 使用自定义事件机制进行微应用之间的通信。每个微应用都有自己的事件通道，通过沙箱机制，事件只能在当前微应用内部触发和监听，从而实现了事件的隔离。

总的来说，Qiankun 的 JS 沙箱通过代理全局对象、隔离上下文环境、限制访问权限等方式，确保了微应用之间的全局变量和事件不会发生冲突，从而实现了微前端应用的安全和稳定运行。