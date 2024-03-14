/**
 * @author Kuitos
 * @homepage https://github.com/kuitos/
 * @since 2018-08-15 11:37
 */

import processTpl, { genLinkReplaceSymbol, genScriptReplaceSymbol } from './process-tpl';
import {
	defaultGetPublicPath,
	evalCode,
	getGlobalProp,
	getInlineCode,
	noteGlobalProps,
	readResAsString,
	requestIdleCallback,
} from './utils';

const styleCache = {};
const scriptCache = {};
const embedHTMLCache = {};

if (!window.fetch) {
	throw new Error('[import-html-entry] Here is no "fetch" on the window env, you need to polyfill it');
}
const defaultFetch = window.fetch.bind(window);

function defaultGetTemplate(tpl) {
	return tpl;
}

/**
 * convert external css link to inline style for performance optimization
 * @param template
 * @param styles
 * @param opts
 * @return embedHTML
 */
function getEmbedHTML(template, styles, opts = {}) {
	const { fetch = defaultFetch } = opts;
	let embedHTML = template;

	return getExternalStyleSheets(styles, fetch)
		.then(styleSheets => {
			embedHTML = styles.reduce((html, styleSrc, i) => {
				html = html.replace(genLinkReplaceSymbol(styleSrc), isInlineCode(styleSrc) ? `${styleSrc}` : `<style>/* ${styleSrc} */${styleSheets[i]}</style>`);
				return html;
			}, embedHTML);
			return embedHTML;
		});
}

const isInlineCode = code => code.startsWith('<');

function getExecutableScript(scriptSrc, scriptText, opts = {}) {
	const { proxy, strictGlobal, scopedGlobalVariables = [] } = opts;

	const sourceUrl = isInlineCode(scriptSrc) ? '' : `//# sourceURL=${scriptSrc}\n`;
	/* sourceUrl为
	//# sourceURL=http://localhost:2222/js/app.js
	*/

	// 将 scopedGlobalVariables 拼接成变量声明，用于缓存全局变量，避免每次使用时都走一遍代理
	const scopedGlobalVariableDefinition = scopedGlobalVariables.length ? `const {${scopedGlobalVariables.join(',')}}=this;` : '';
	/* 
	scopedGlobalVariableDefinition为
	"const {Array,ArrayBuffer,Boolean,constructor,DataView,Date,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Error,escape,EvalError,Float32Array,Float64Array,Function,hasOwnProperty,Infinity,Int16Array,Int32Array,Int8Array,isFinite,isNaN,isPrototypeOf,JSON,Map,Math,NaN,Number,Object,parseFloat,parseInt,Promise,propertyIsEnumerable,Proxy,RangeError,ReferenceError,Reflect,RegExp,Set,String,Symbol,SyntaxError,toLocaleString,toString,TypeError,Uint16Array,Uint32Array,Uint8Array,Uint8ClampedArray,undefined,unescape,URIError,valueOf,WeakMap,WeakSet,window,self,globalThis,requestAnimationFrame}=this;"
	*/

	// 通过这种方式获取全局 window，因为 script 也是在全局作用域下运行的，所以我们通过 window.proxy 绑定时也必须确保绑定到全局 window 上
	// 否则在嵌套场景下， window.proxy 设置的是内层应用的 window，而代码其实是在全局作用域运行的，会导致闭包里的 window.proxy 取的是最外层的微应用的 proxy
	const globalWindow = (0, eval)('window');
	/* 将当前沙箱容器中被proxy代理的假window对象(fakeWindow) 赋值给window.proxy 这样可让全局访问*/
	globalWindow.proxy = proxy;
	// TODO 通过 strictGlobal 方式切换 with 闭包，待 with 方式坑趟平后再合并
	//  with(this)和bind 来将执行环境指定为 window.proxy，那么scriptText的js文件code的使用的window/self/this指向都是window.proxy
	// 应用代码，通过 with 确保所有的全局变量的操作实际都是在操作 qiankun 提供的代理对象
	// 将子应用的js文件执行code绑定在window.proxy对象上(其实就是沙箱的fakeWindow)
	return strictGlobal
		? (
			scopedGlobalVariableDefinition
				? `;(function(){with(this){${scopedGlobalVariableDefinition}${scriptText}\n${sourceUrl}}}).bind(window.proxy)();`
				: `;(function(window, self, globalThis){with(window){;${scriptText}\n${sourceUrl}}}).bind(window.proxy)(window.proxy, window.proxy, window.proxy);`
		)
		: `;(function(window, self, globalThis){;${scriptText}\n${sourceUrl}}).bind(window.proxy)(window.proxy, window.proxy, window.proxy);`;
}

// for prefetch
export function getExternalStyleSheets(styles, fetch = defaultFetch) {
	return Promise.all(styles.map(styleLink => {
			if (isInlineCode(styleLink)) {
				// if it is inline style
				return getInlineCode(styleLink);
			} else {
				// external styles
				return styleCache[styleLink] ||
					(styleCache[styleLink] = fetch(styleLink).then(response => response.text()));
			}

		},
	));
}
/* 拉取对应地址的js文件，并解析成string */
// for prefetch
export function getExternalScripts(scripts, fetch = defaultFetch) {

	const fetchScript = (scriptUrl, opts) => scriptCache[scriptUrl] ||
		(scriptCache[scriptUrl] = fetch(scriptUrl, opts).then(response => {
			// usually browser treats 4xx and 5xx response of script loading as an error and will fire a script error event
			// https://stackoverflow.com/questions/5625420/what-http-headers-responses-trigger-the-onerror-handler-on-a-script-tag/5625603
			if (response.status >= 400) {
				throw new Error(`${scriptUrl} load failed with status ${response.status}`);
			}

			return response.text();
		}));

	return Promise.all(scripts.map(script => {

			if (typeof script === 'string') {
				if (isInlineCode(script)) {
					// if it is inline script
					return getInlineCode(script);
				} else {
					// external script
					return fetchScript(script);
				}
			} else {
				// use idle time to load async script
				const { src, async, crossOrigin } = script;
				const fetchOpts = crossOrigin ? { credentials: 'include' } : {};

				if (async) {
					return {
						src,
						async: true,
						content: new Promise((resolve, reject) => requestIdleCallback(() => fetchScript(src, fetchOpts).then(resolve, reject))),
					};
				}

				return fetchScript(src, fetchOpts);
			}
		},
	));
}

function throwNonBlockingError(error, msg) {
	setTimeout(() => {
		console.error(msg);
		throw error;
	});
}

const supportsUserTiming =
	typeof performance !== 'undefined' &&
	typeof performance.mark === 'function' &&
	typeof performance.clearMarks === 'function' &&
	typeof performance.measure === 'function' &&
	typeof performance.clearMeasures === 'function';

/**
 * FIXME to consistent with browser behavior, we should only provide callback way to invoke success and error event
 * @param entry
 * @param scripts
 * @param proxy
 * @param opts
 * @returns {Promise<unknown>}
 */
export function execScripts(entry, scripts, proxy = window, opts = {}) {
	const {
		fetch = defaultFetch, strictGlobal = false, success, error = () => {
		}, beforeExec = () => {
		}, afterExec = () => {
		},
		scopedGlobalVariables = [],
	} = opts;

	return getExternalScripts(scripts, fetch)
		.then(scriptsText => {
			/* scriptsText: js文件的内容 : string[] */

			const geval = (scriptSrc, inlineScript) => {
				const rawCode = beforeExec(inlineScript, scriptSrc) || inlineScript;
				/* 
				getExecutableScript方法
				1. 将当前沙箱容器中被proxy代理的假window对象(fakeWindow) 赋值给window.proxy 这样可让全局访问
				2. scopedGlobalVariables全局作用域的变量数组拼接为string注入inlineScript代码字符串中执行
				3. 将子应用的js文件执行code的window/self/this指向绑定在window.proxy对象上，达到改变执行环境的作用(其实就是沙箱的fakeWindow)
				4. 返回一个拼接改造后的code文件
				*/
				const code = getExecutableScript(scriptSrc, rawCode, { proxy, strictGlobal, scopedGlobalVariables });


				/* 执行代码 
				1. 执行子应用的js文件，同时将子应用的[window挂载的属性,子应用main文件export的函数,其他]绑定到父应用代理的window.proxy对象
				*/
				evalCode(scriptSrc, code);

				/* 调试代码：查看evalCode执行当前沙箱容器中被proxy代理的假window对象(fakeWindow) 新赋的属性 */
				console.log('🚀 ~ evalCode ~ proxy:', proxy)

				afterExec(inlineScript, scriptSrc);
			};


			function exec(scriptSrc, inlineScript, resolve) {

				const markName = `Evaluating script ${scriptSrc}`;
				const measureName = `Evaluating Time Consuming: ${scriptSrc}`;

				if (process.env.NODE_ENV === 'development' && supportsUserTiming) {
					performance.mark(markName);
				}

				if (scriptSrc === entry) {
					noteGlobalProps(strictGlobal ? proxy : window);
					try {
						geval(scriptSrc, inlineScript);
						const exports = proxy[getGlobalProp(strictGlobal ? proxy : window)] || {};
						resolve(exports);
					} catch (e) {
						// entry error must be thrown to make the promise settled
						console.error(`[import-html-entry]: error occurs while executing entry script ${scriptSrc}`);
						throw e;
					}
				} else {
					if (typeof inlineScript === 'string') {
						try {
							if (scriptSrc?.src) {
								geval(scriptSrc.src, inlineScript);
							} else {
								geval(scriptSrc, inlineScript);
							}
						} catch (e) {
							// consistent with browser behavior, any independent script evaluation error should not block the others
							throwNonBlockingError(e, `[import-html-entry]: error occurs while executing normal script ${scriptSrc}`);
						}
					} else {
						// external script marked with async
						inlineScript.async && inlineScript?.content
							.then(downloadedScriptText => geval(inlineScript.src, downloadedScriptText))
							.catch(e => {
								throwNonBlockingError(e, `[import-html-entry]: error occurs while executing async script ${inlineScript.src}`);
							});
					}
				}

				if (process.env.NODE_ENV === 'development' && supportsUserTiming) {
					performance.measure(measureName, markName);
					performance.clearMarks(markName);
					performance.clearMeasures(measureName);
				}
			}

			/* 该函数用于按顺序执行所有脚本。它会递归调用自身，并在每次调用中执行一个脚本。在执行完最后一个脚本后，会通过 resolve 函数解析 Promise。 */
			function schedule(i, resolvePromise) {

				if (i < scripts.length) {
					const scriptSrc = scripts[i];
					/* scriptSrc: js文件的url地址 */
					const inlineScript = scriptsText[i];
					/* inlineScript：js文件的内容 ： string */
					exec(scriptSrc, inlineScript, resolvePromise);
					// resolve the promise while the last script executed and entry not provided
					if (!entry && i === scripts.length - 1) {
						resolvePromise();
					} else {
						schedule(i + 1, resolvePromise);
					}
				}
			}

			return new Promise(resolve => schedule(0, success || resolve));
		}).catch((e) => {
			error();
			throw e;
		});
}

export default function importHTML(url, opts = {}) {
	let fetch = defaultFetch;
	let autoDecodeResponse = false;
	let getPublicPath = defaultGetPublicPath;
	let getTemplate = defaultGetTemplate;
	const { postProcessTemplate } = opts;

	// compatible with the legacy importHTML api
	if (typeof opts === 'function') {
		fetch = opts;
	} else {
		// fetch option is availble
		if (opts.fetch) {
			// fetch is a funciton
			if (typeof opts.fetch === 'function') {
				fetch = opts.fetch;
			} else { // configuration
				fetch = opts.fetch.fn || defaultFetch;
				autoDecodeResponse = !!opts.fetch.autoDecodeResponse;
			}
		}
		getPublicPath = opts.getPublicPath || opts.getDomain || defaultGetPublicPath;
		getTemplate = opts.getTemplate || defaultGetTemplate;
	}

	/* 对解析操作做了缓存处理，如果相同的url已经被处理过，则直接返回处理结果，否则通过fetch去获取模板字符串，并进行后续处理 */
	return embedHTMLCache[url] || (embedHTMLCache[url] = fetch(url)
		.then(response => readResAsString(response, autoDecodeResponse))
		.then(html => {
			console.log('html', html);
			const assetPublicPath = getPublicPath(url);
			const { template, scripts, entry, styles } = processTpl(getTemplate(html), assetPublicPath, postProcessTemplate);
			/* 
			template: 经过初步处理过的模板字符串
			assetPublicPath: 外部脚本和样式的链接前缀
			scripts:所有外部脚本的src值组成的数组
			styles:所有外部样式的href值组成的数组
			entry:上面提到的html模板的入口脚本链接
			如果模板中没有被标记为entry的script标签，则会返回最后一个script标签的src值
			*/

			/* 调用getEmbedHTML函数将所有通过外部引入的样式，转换为内联样式 */
			return getEmbedHTML(template, styles, { fetch }).then(embedHTML => ({
				template: embedHTML,
				assetPublicPath,
				getExternalScripts: () => getExternalScripts(scripts, fetch),
				getExternalStyleSheets: () => getExternalStyleSheets(styles, fetch),
				execScripts: (proxy, strictGlobal, opts = {}) => {
					if (!scripts.length) {
						return Promise.resolve();
					}
					console.log('🚀 ~ qiankun调用execScripts传入的 ~', proxy, strictGlobal, opts)
					console.log('🚀 ~ importHTML返回execScripts内部接受的 ~', entry, scripts)
					return execScripts(entry, scripts, proxy, {
						fetch,
						strictGlobal,
						...opts,
					});
				},
			}));
		}));
		console.log('🚀 ~ importHTML ~ html:', html)
		console.log('🚀 ~ importHTML ~ html:', html)
		console.log('🚀 ~ importHTML ~ html:', html)
		console.log('🚀 ~ importHTML ~ html:', html)
		console.log('🚀 ~ importHTML ~ html:', html)
		console.log('🚀 ~ importHTML ~ html:', html)
		console.log('🚀 ~ importHTML ~ html:', html)
		console.log('🚀 ~ importHTML ~ html:', html)
}

export function importEntry(entry, opts = {}) {
	const { fetch = defaultFetch, getTemplate = defaultGetTemplate, postProcessTemplate } = opts;
	const getPublicPath = opts.getPublicPath || opts.getDomain || defaultGetPublicPath;

	if (!entry) {
		throw new SyntaxError('entry should not be empty!');
	}

	// html entry
	if (typeof entry === 'string') {
		return importHTML(entry, {
			fetch,
			getPublicPath,
			getTemplate,
			postProcessTemplate,
		});
	}

	// config entry
	if (Array.isArray(entry.scripts) || Array.isArray(entry.styles)) {

		const { scripts = [], styles = [], html = '' } = entry;
		const getHTMLWithStylePlaceholder = tpl => styles.reduceRight((html, styleSrc) => `${genLinkReplaceSymbol(styleSrc)}${html}`, tpl);
		const getHTMLWithScriptPlaceholder = tpl => scripts.reduce((html, scriptSrc) => `${html}${genScriptReplaceSymbol(scriptSrc)}`, tpl);

		return getEmbedHTML(getTemplate(getHTMLWithScriptPlaceholder(getHTMLWithStylePlaceholder(html))), styles, { fetch }).then(embedHTML => ({
			template: embedHTML,
			assetPublicPath: getPublicPath(entry),
			getExternalScripts: () => getExternalScripts(scripts, fetch),
			getExternalStyleSheets: () => getExternalStyleSheets(styles, fetch),
			execScripts: (proxy, strictGlobal, opts = {}) => {
				if (!scripts.length) {
					return Promise.resolve();
				}
				return execScripts(scripts[scripts.length - 1], scripts, proxy, {
					fetch,
					strictGlobal,
					...opts,
				});
			},
		}));

	} else {
		throw new SyntaxError('entry scripts or styles should be array!');
	}
}
