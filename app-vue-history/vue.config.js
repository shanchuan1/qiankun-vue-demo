const { name } = require('./package');
module.exports = {
  devServer: {
    port: 2222,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  chainWebpack: (config) => {
    // 在 HTMLWebpackPlugin 插件生成的 HTML 中为 script 标签的 src 属性补全路径
    config.plugin('html').tap(args => {
      args[0].chunksSortMode = 'none'; // 保持 chunk 的顺序不变
      args[0].filename = 'index.html'; // 更改生成的 HTML 文件名
      return args;
    });
    
    config.module
      .rule('fonts')
      .test(/.(ttf|otf|eot|woff|woff2)$/)
      .use('url-loader')
      .loader('url-loader')
      .tap(options => ({ name: '/fonts/[name].[hash:8].[ext]' }))
      .end()
  },
  // 自定义webpack配置
  configureWebpack: {
    output: {
      library: `${name}-[name]`,
      libraryTarget: 'umd',// 把子应用打包成 umd 库格式
      jsonpFunction: `webpackJsonp_${name}`,
    },
  },
  
};
