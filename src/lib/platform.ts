// Platform helpers — Expo / React Native mappings (no Capacitor).

import * as Clipboard from 'expo-clipboard'
import * as Device from 'expo-device'
import * as Haptics from 'expo-haptics'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import {
  AppState,
  Keyboard,
  type AppStateStatus,
  Platform,
  StatusBar
} from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'

/** Runtime OS name (Expo client targets ios | android | web). */
export type PlatformName = 'ios' | 'android' | 'web'

/** @deprecated Prefer {@link PlatformName}; kept for OpenClaw connect payloads. */
export type PlatformType = PlatformName

export function isNativePlatform(): boolean {
  return Platform.OS !== 'web'
}

export function getPlatformName(): PlatformName {
  const os = Platform.OS
  if (os === 'ios' || os === 'android' || os === 'web') {
    return os
  }
  return 'web'
}

/** Value sent in OpenClaw `connect` client.platform (iOS / Android / web). */
export function getPlatform(): PlatformType {
  return getPlatformName()
}

export interface PlatformDeviceInfo {
  isPhysicalDevice: boolean
  modelName: string | null
  brand: string | null
  manufacturer: string | null
  osName: string | null
  osVersion: string | null
  deviceYearClass: number | null
}

export function getDeviceInfo(): PlatformDeviceInfo {
  return {
    isPhysicalDevice: Device.isDevice,
    modelName: Device.modelName,
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    osName: Device.osName,
    osVersion: Device.osVersion,
    deviceYearClass: Device.deviceYearClass ?? null
  }
}

export async function openUrl(url: string): Promise<void> {
  const can = await Linking.canOpenURL(url)
  if (!can) {
    throw new Error(`Cannot open URL: ${url}`)
  }
  await Linking.openURL(url)
}

export async function openBrowser(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url)
}

export function getAppState(): AppStateStatus {
  return AppState.currentState
}

export function onAppStateChange(
  callback: (next: AppStateStatus) => void
): { remove: () => void } {
  const sub = AppState.addEventListener('change', callback)
  return { remove: () => sub.remove() }
}

export async function vibrate(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  } catch {
    /* Haptics unavailable */
  }
}

/**
 * Top inset in px (status bar / notch). Uses safe-area initial metrics + Android StatusBar fallback.
 */
export function getStatusBarHeight(): number {
  const insetTop = initialWindowMetrics?.insets.top
  if (insetTop != null && insetTop > 0) {
    return insetTop
  }
  if (Platform.OS === 'android') {
    return StatusBar.currentHeight ?? 0
  }
  return 0
}

export function isKeyboardVisible(): boolean {
  return Keyboard.isVisible()
}

export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text)
}
