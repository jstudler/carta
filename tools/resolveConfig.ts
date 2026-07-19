/**
 * Environment-resolved application config for the Node build pipeline.
 *
 * `APP_CONFIG` is plain data shared with the browser bundle, so it cannot read
 * `process.env` itself. The Vite plugins resolve the env overrides here instead,
 * and every plugin uses this one function so they always agree on the config.
 */

import { APP_CONFIG, type AppConfig } from '../app.config';

export function resolveAppConfig(): AppConfig {
  return {
    ...APP_CONFIG,
    contentDir: process.env.CONTENT_DIR ?? APP_CONFIG.contentDir,
    renderedDir: process.env.RENDERED_DIR ?? APP_CONFIG.renderedDir,
    mediaBaseUrl: process.env.MEDIA_BASE_URL ?? APP_CONFIG.mediaBaseUrl,
    site: {
      ...APP_CONFIG.site,
      // Trailing slashes would produce '//og.png' in the absolute preview URL.
      url: (process.env.SITE_URL ?? APP_CONFIG.site.url).replace(/\/+$/, ''),
    },
  };
}
