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