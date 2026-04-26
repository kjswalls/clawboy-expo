// App metadata and OpenClaw client identity
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

export const APP_NAME = 'ClawBoy';

// Single source of truth — read from app.json at runtime so there's no
// manual constant to keep in sync.
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
export const BUILD_NUMBER: string = Constants.expoConfig?.ios?.buildNumber ?? '0';

// The ID of the currently running OTA bundle, or null when running the
// embedded (store) bundle. Useful for correlating crash reports.
export const UPDATE_ID: string | null = Updates.updateId ?? null;

export const PROTOCOL_VERSION = '1';
export const APP_IDENTIFIER = 'com.clawboy.app';

// Must match the clientId embedded in the device challenge signature payload.
export const OPENCLAW_CLIENT_ID = 'openclaw-control-ui';
export const OPENCLAW_CLIENT_MODE = 'ui';
export const OPENCLAW_ROLE = 'operator';
