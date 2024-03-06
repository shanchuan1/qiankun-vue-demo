import { importEntry } from 'import-html-entry';


/* 从http://localhost:2222地址fetch的index.html源文件

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <link rel="icon" href="/favicon.ico">
    <title>app-vue-history</title>
    <link href="/js/about.js" rel="prefetch">
    <link href="/js/app.js" rel="preload" as="script">
    <link href="/js/chunk-vendors.js" rel="preload" as="script">
  </head>
  <body>
    <noscript>
      <strong>We're sorry but app-vue-history doesn't work properly without JavaScript enabled. Please enable it to continue.</strong>
    </noscript>
    <div id="appVueHistory"></div>
    <!-- built files will be auto injected -->
  <script type="text/javascript" src="/js/chunk-vendors.js"></script>
  <script type="text/javascript" src="/js/app.js"></script></body>
</html>
*/


const entry = "http://localhost:2222"; // 传递给 importEntry 的参数
const importEntryOpts = {prefetch:true}; // 传递给 importEntry 的参数
    

(async () => {
  const { template, execScripts, assetPublicPath, getExternalScripts } =
    await importEntry(entry, importEntryOpts);
    /* 
    template ： 改造后的index.html的字符串，
    execScripts： 执行js脚本的函数，
    assetPublicPath：资源公共地址，
    getExternalScripts：加载拉取其他js脚本的函数
    */

    /* 利用getExternalScripts这个方法去拉取加载index.html内被注释掉的js文件引入 */
    await getExternalScripts();
})();



/* importEntry改造后的index.html  === template
利用正则匹配掉js与css文件，
同时补全相对路径成完整路径地址如：http://localhost:2222/js/chunk-vendors.js（方便后面给getExternalScripts拉取加载），并将其注释)

 <!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <link rel="icon" href="/favicon.ico">
    <title>app-vue-history</title>
    <!-- prefetch/preload link /js/about.js replaced by import-html-entry -->
    <!-- prefetch/preload link /js/app.js replaced by import-html-entry -->
    <!-- prefetch/preload link /js/chunk-vendors.js replaced by import-html-entry -->
  </head>
  <body>
    <noscript>
      <strong>We're sorry but app-vue-history doesn't work properly without JavaScript enabled. Please enable it to continue.</strong>
    </noscript>
    <div id="appVueHistory"></div>
    
  <!--   script http://localhost:2222/js/chunk-vendors.js replaced by import-html-entry -->
  <!--   script http://localhost:2222/js/app.js replaced by import-html-entry -->
  </body>
</html>
*/

`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <link rel="icon" href="/favicon.ico">
    <title>app-vue-history</title>
    <!-- prefetch/preload link /js/about.js replaced by import-html-entry -->
    <!-- prefetch/preload link /js/app.js replaced by import-html-entry -->
    <!-- prefetch/preload link /js/chunk-vendors.js replaced by import-html-entry -->
  </head>
  <body>
    <noscript>
      <strong>We're sorry but app-vue-history doesn't work properly without JavaScript enabled. Please enable it to continue.</strong>
    </noscript>
    <div id="appVueHistory"></div>
    
  <!--   script http://localhost:2222/js/chunk-vendors.js replaced by import-html-entry -->
  <!--   script http://localhost:2222/js/app.js replaced by import-html-entry --></body>
`