
import { mountRootParcel, registerApplication, start as startSingleSpa } from 'single-spa';
import { loadApp } from '../loader';
import { Deferred, getContainerXPath, isConstDestructAssignmentSupported, toArray } from '../utils';

let started = false;
const appConfigPromiseGetterMap = new Map();
const containerMicroAppsMap = new Map();

/* 低版本浏览器的自动降级 */
const autoDowngradeForLowVersionBrowser = (configuration) => {
  const { sandbox = true, singular } = configuration;
  if (sandbox) {
    if (!window.Proxy) {
      console.warn('[qiankun] Missing window.Proxy, proxySandbox will degenerate into snapshotSandbox');

      if (singular === false) {
        console.warn(
          '[qiankun] Setting singular as false may cause unexpected behavior while your browser not support window.Proxy',
        );
      }

      return { ...configuration, sandbox: typeof sandbox === 'object' ? { ...sandbox, loose: true } : { loose: true } };
    }

    if (
      !isConstDestructAssignmentSupported() &&
      (sandbox === true || (typeof sandbox === 'object' && sandbox.speedy !== false))
    ) {
      console.warn(
        '[qiankun] Speedy mode will turn off as const destruct assignment not supported in current browser!',
      );

      return {
        ...configuration,
        sandbox: typeof sandbox === 'object' ? { ...sandbox, speedy: false } : { speedy: false },
      };
    }
  }

  return configuration;
};



export function loadMicroApp(app, configuration, lifeCycles) {
    const { props, name } = app;
  
    const container = 'container' in app ? app.container : undefined;
    const containerXPath = getContainerXPath(container);
    const appContainerXPathKey = `${name}-${containerXPath}`;
  
    let microApp;
    const wrapParcelConfigForRemount = (config) => {
      let microAppConfig = config;
      if (container) {
        if (containerXPath) {
          const containerMicroApps = containerMicroAppsMap.get(appContainerXPathKey);
          if (containerMicroApps && containerMicroApps.length) {
            const mount = [
              async () => {
                const prevLoadMicroApps = containerMicroApps.slice(0, containerMicroApps.indexOf(microApp));
                const prevLoadMicroAppsWhichNotBroken = prevLoadMicroApps.filter(
                  (v) => v.getStatus() !== 'LOAD_ERROR' && v.getStatus() !== 'SKIP_BECAUSE_BROKEN',
                );
                await Promise.all(prevLoadMicroAppsWhichNotBroken.map((v) => v.unmountPromise));
              },
              ...toArray(microAppConfig.mount),
            ];
  
            microAppConfig = {
              ...config,
              mount,
            };
          }
        }
      }
  
      return {
        ...microAppConfig,
        bootstrap: () => Promise.resolve(),
      };
    };
  
    const memorizedLoadingFn = async () => {
      const userConfiguration = autoDowngradeForLowVersionBrowser(
        configuration ?? { ...frameworkConfiguration, singular: false },
      );
      const { $$cacheLifecycleByAppName } = userConfiguration;
  
      if (container) {
        if ($$cacheLifecycleByAppName) {
          const parcelConfigGetterPromise = appConfigPromiseGetterMap.get(name);
          if (parcelConfigGetterPromise) return wrapParcelConfigForRemount((await parcelConfigGetterPromise)(container));
        }
  
        if (containerXPath) {
          const parcelConfigGetterPromise = appConfigPromiseGetterMap.get(appContainerXPathKey);
          if (parcelConfigGetterPromise) return wrapParcelConfigForRemount((await parcelConfigGetterPromise)(container));
        }
      }
  
      const parcelConfigObjectGetterPromise = loadApp(app, userConfiguration, lifeCycles);
  
      if (container) {
        if ($$cacheLifecycleByAppName) {
          appConfigPromiseGetterMap.set(name, parcelConfigObjectGetterPromise);
        } else if (containerXPath) appConfigPromiseGetterMap.set(appContainerXPathKey, parcelConfigObjectGetterPromise);
      }
  
      return (await parcelConfigObjectGetterPromise)(container);
    };
  
    if (!started && configuration?.autoStart !== false) {
      startSingleSpa({ urlRerouteOnly: frameworkConfiguration.urlRerouteOnly ?? defaultUrlRerouteOnly });
    }
  
    microApp = mountRootParcel(memorizedLoadingFn, { domElement: document.createElement('div'), ...props });
  
    if (container) {
      if (containerXPath) {
        const microAppsRef = containerMicroAppsMap.get(appContainerXPathKey) || [];
        microAppsRef.push(microApp);
        containerMicroAppsMap.set(appContainerXPathKey, microAppsRef);
  
        const cleanup = () => {
          const index = microAppsRef.indexOf(microApp);
          microAppsRef.splice(index, 1);
        };
  
        microApp.unmountPromise.then(cleanup).catch(cleanup);
      }
    }
    console.log('🚀 ~ microApp:', microApp);
    return microApp;
}
  