/**
 * AsyncStorage-backed persistence for the offline demo.
 * Stores the per-user session list (sessions the user created in demo) and
 * their message histories. Does NOT use SecureStore — demo content is
 * non-sensitive.
 *
 * Schema version is embedded so future changes can migrate gracefully.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@/lib/openclaw/types';
import type { DemoHistoryMessage } from './demoData';

const DEMO_SESSIONS_KEY = 'clawboy-demo-sessions-v1';
const DEMO_HISTORY_PREFIX = 'clawboy-demo-history-v1:';

// ---------------------------------------------------------------------------
// Session list
// ---------------------------------------------------------------------------

export async function loadDemoUserSessions(): Promise<Session[]> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Session[];
  } catch {
    return [];
  }
}

export async function saveDemoUserSessions(sessions: Session[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* ignore */
  }
}

export async function clearDemoStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const demoKeys = keys.filter(
      (k) => k === DEMO_SESSIONS_KEY || k.startsWith(DEMO_HISTORY_PREFIX),
    );
    if (demoKeys.length > 0) {
      await AsyncStorage.multiRemove(demoKeys);
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Per-session message history
// ---------------------------------------------------------------------------

export async function loadDemoHistory(sessionKey: string): Promise<DemoHistoryMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_HISTORY_PREFIX + sessionKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as DemoHistoryMessage[];
  } catch {
    return [];
  }
}

export async function saveDemoHistory(
  sessionKey: string,
  messages: DemoHistoryMessage[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      DEMO_HISTORY_PREFIX + sessionKey,
      JSON.stringify(messages.slice(-50)),
    );
  } catch {
    /* ignore */
  }
}
