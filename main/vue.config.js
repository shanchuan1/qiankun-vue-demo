const path = require("path");

const proxy = {
  proxy: {
    '/app1': {
      // target: process.env.VUE_APP_PROXY_LOCAL_URL,
      target: 'http://localhost:2222',
      changeOrigin: true,
      logLevel: 'debug'
    },
    '/openapi': {
      target: 'http://192.168.22.151:8097', // * 2.0后端地址，常驻地址
      changeOrigin: true,
      pathRewrite: {
        '^/openapi': '' // 需要rewrite的,
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
