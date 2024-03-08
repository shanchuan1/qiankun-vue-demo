import {
  NOT_BOOTSTRAPPED,
  BOOTSTRAPPING,
  NOT_MOUNTED,
  SKIP_BECAUSE_BROKEN,
  toName,
  isParcel,
} from "../applications/app.helpers.js";
import { reasonableTime } from "../applications/timeouts.js";
import { handleAppError, transformErr } from "../applications/app-errors.js";
import { addProfileEntry } from "../devtools/profiler.js";

const __PROFILE__ = true

export function toBootstrapPromise(appOrParcel, hardFail) {
  let startTime, profileEventType;

  return Promise.resolve().then(() => {
    if (appOrParcel.status !== NOT_BOOTSTRAPPED) {
      return appOrParcel;
    }

    if (__PROFILE__) {
      profileEventType = isParcel(appOrParcel) ? "parcel" : "application";
      startTime = performance.now();
    }

    appOrParcel.status = BOOTSTRAPPING;

    if (!appOrParcel.bootstrap) {
      // Default implementation of bootstrap
      return Promise.resolve().then(successfulBootstrap);
    }

    /* 执行子应用的bootstrap生命周期函数 */
    return reasonableTime(appOrParcel, "bootstrap")
      .then(successfulBootstrap)
      .catch((err) => {
        if (__PROFILE__) {
          addProfileEntry(
            profileEventType,
            toName(appOrParcel),
            "bootstrap",
            startTime,
            performance.now(),
            false
          );
        }

        if (hardFail) {
          throw transformErr(err, appOrParcel, SKIP_BECAUSE_BROKEN);
        } else {
          handleAppError(err, appOrParcel, SKIP_BECAUSE_BROKEN);
          return appOrParcel;
        }
      });
  });

  function successfulBootstrap() {
    appOrParcel.status = NOT_MOUNTED;

    if (__PROFILE__) {
      addProfileEntry(
        profileEventType,
        toName(appOrParcel),
        "bootstrap",
        startTime,
        performance.now(),
        true
      );
    }

    return appOrParcel;
  }
}
