const path = require("path");

const proxy = {
  proxy: {
    '/app-history': { // 本地配置子应用代理
      // target: process.env.VUE_APP_PROXY_LOCAL_URL,
      target: 'http://localhost:2222',
      changeOrigin: true,
      logLevel: 'debug',
      pathRewrite: {
        '^/app-history': '' // 需要rewrite的, 因为http://localhost:2222服务器不存在http://localhost:2222/app1这样的路径所以需要修改请求路径
      }
    },
  }
}

module.exports = {
  devServer: {
    open: true,
    ...proxy,
  },
  transpileDependencies: ["single-spa", "qiankun", "import-html-entry"],
  // chainWebpack: (config) => {
  //   config.resolve.alias.set(
  //     "qiankun",
  //     path.resolve(__dirname, "src/code")
  //     // "./patchers",
  //     // path.resolve(__dirname, "src/assets/patchers.js")
  //   );
  // },
};
