/**
 * Demo-mode local asset resolution.
 *
 * Extracted from DemoOpenClawClient so the asset cache and resolver live in
 * their own module. `clearAssetCache()` is called by `clearDemoStorage` so
 * the cache is reset when the user exits demo mode.
 *
 * The module-level cache variables are intentional: they are lazy-initialized
 * (never set at import time), always reset via `clearAssetCache`, and the
 * promise is cleared after it settles so a failed attempt can be retried.
 */

let _sunsetAssetUri: string | null = null;
let _sunsetAssetPromise: Promise<string> | null = null;

/** Reset the in-memory asset cache. Called from `clearDemoStorage`. */
export function clearAssetCache(): void {
  _sunsetAssetUri = null;
  _sunsetAssetPromise = null;
}

/**
 * Lazy-resolve the bundled sunset demo image to a local file URI.
 * Returns the sentinel string `'__demo_asset_sunset__'` in test/CI
 * environments where `expo-asset` is unavailable.
 */
export function getSunsetAssetUri(): Promise<string> {
  if (_sunsetAssetUri) return Promise.resolve(_sunsetAssetUri);
  if (!_sunsetAssetPromise) {
    _sunsetAssetPromise = (async (): Promise<string> => {
      try {
        // Dynamic require so bundlers don't fail when the asset is absent in tests.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Asset } = require('expo-asset') as typeof import('expo-asset');
        const asset = Asset.fromModule(
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('../../../assets/demo/sunset.jpg') as number,
        );
        await asset.downloadAsync();
        _sunsetAssetUri = asset.localUri ?? asset.uri ?? '__demo_asset_sunset__';
      } catch {
        _sunsetAssetUri = '__demo_asset_sunset__';
      }
      // Clear the in-flight promise so a future call can retry if needed.
      _sunsetAssetPromise = null;
      return _sunsetAssetUri!;
    })();
  }
  return _sunsetAssetPromise;
}
