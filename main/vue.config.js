const path = require("path");

module.exports = {
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
