import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import Constants from 'expo-constants';

/**
 * Configure RevenueCat at app startup.
 *
 * Call once from PurchasesProvider on mount — before any purchase or
 * entitlement check. Calling multiple times is safe (RC is idempotent).
 *
 * No appUserID is passed here — RC creates an anonymous ID automatically.
 * The anonymous ID is aliased to the Supabase user.id in PurchasesContext
 * when the user signs in.
 */
export function configurePurchases(): void {
  const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;
  const iosKey = extra?.revenueCatApiKeyIos ?? '';
  const androidKey = extra?.revenueCatApiKeyAndroid ?? '';

  const apiKey = Platform.OS === 'ios' ? iosKey : androidKey;

  if (!apiKey || apiKey.startsWith('REPLACE_WITH') || apiKey.startsWith('test_')) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Purchases] RevenueCat API key not configured. IAP disabled.');
    }
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey });
}
