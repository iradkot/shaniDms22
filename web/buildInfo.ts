import type {SettingsAppInfo} from '../src/modules/settings';

declare const __SHANI_WEB_BUILD__: SettingsAppInfo | undefined;

/** Embedded by Vite, so this identifies the loaded bundle even while offline. */
export const WEB_BUILD_INFO: SettingsAppInfo =
  typeof __SHANI_WEB_BUILD__ === 'undefined' ? {} : __SHANI_WEB_BUILD__ ?? {};
