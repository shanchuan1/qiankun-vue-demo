/**
 * @author Kuitos
 * @since 2020-03-02
 */

import { concat, mergeWith } from 'lodash';
import getEngineFlagAddon from './engineFlag';
import getRuntimePublicPathAddOn from './runtimePublicPath';

export default function getAddOns(global, publicPath) {
  const Merged = mergeWith({}, getEngineFlagAddon(global), getRuntimePublicPathAddOn(global, publicPath), (v1, v2) =>
    concat(v1 ?? [], v2 ?? []),
  );
  console.log('🚀 ~ getAddOns ~ Merged:', Merged)
  return Merged
  /* Merged对象
  {
    "beforeLoad": [
        ƒ beforeLoad(),
        ƒ beforeLoad()
    ],
    "beforeMount": [
        ƒ beforeMount(),
        ƒ beforeMount()
    ],
    "beforeUnmount": [
        ƒ beforeUnmount(),
        ƒ beforeUnmount()
    ]
  }
  */
}
