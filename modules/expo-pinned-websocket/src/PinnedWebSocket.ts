/**
 * JS-side WebSocketLike wrapper around the native ExpoPinnedWebsocket module.
 *
 * Implements the WebSocketLike interface from src/lib/openclaw/types.ts so the
 * protocol layer can consume it transparently via the WebSocketFactory pattern.
 */

import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
// NOTE: keep in sync with src/lib/openclaw/types.ts WebSocketLike.
// Inlined here to avoid a cross-module path dependency from the native module wrapper.
export interface WebSocketLike {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly CLOSING: number;
  readonly CLOSED: number;
}

export interface PinnedSocketOptions {
  url: string;
  /** Active SPKI SHA-256 pins (hex). Empty array = TOFU observation mode. */
  allowedSpkiHashes: string[];
  /** Called when the gateway's leaf cert SPKI hash is observed (TOFU + pinning). */
  onPeerSpki?: (sha256Hex: string) => void;
  /** Called when a pin mismatch is detected (only when allowedSpkiHashes is non-empty). */
  onPinError?: (observed: string, allowed: string[]) => void;
}

// ── Native layer ────────────────────────────────────────────────────────────

type NativeModule = {
  createSocket(socketId: number, url: string, allowedSpkiHashes: string[]): void;
  sendMessage(socketId: number, data: string): void;
  closeSocket(socketId: number): void;
};

type SocketEvent = { socketId: number };
type MessageEvent = SocketEvent & { data: string };
type CloseEvent = SocketEvent & { code: number; reason: string; wasClean: boolean };
type ErrorEvent = SocketEvent & { message: string };
type SpkiEvent = SocketEvent & { sha256Hex: string };
type PinErrorEvent = SocketEvent & { observed: string; allowed: string[] };

/** Native bridge + event surface (Expo Modules v2 exposes `addListener` on the module). */
type PinnedNativeModule = NativeModule & {
  addListener: <T>(eventName: string, listener: (event: T) => void) => EventSubscription;
};

// Singleton — re-acquiring the native module on every socket is wasteful.
let _pinned: PinnedNativeModule | null = null;

function getPinned(): PinnedNativeModule {
  if (!_pinned) {
    _pinned = requireNativeModule<PinnedNativeModule>('ExpoPinnedWebsocket');
  }
  return _pinned;
}

function getNextSocketId(): number {
  // Random 31-bit integer. Avoids a module-level mutable counter while
  // keeping the ID range well within a safe integer for the native bridge.
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

// ── PinnedWebSocket ─────────────────────────────────────────────────────────

export class PinnedWebSocket implements WebSocketLike {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState: number = 0; // CONNECTING

  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;

  private readonly socketId: number;
  private readonly opts: PinnedSocketOptions;
  private readonly subs: EventSubscription[] = [];
  private closed = false;

  constructor(opts: PinnedSocketOptions) {
    this.socketId = getNextSocketId();
    this.opts = opts;

    const mod = getPinned();

    const id = this.socketId;

    this.subs.push(
      mod.addListener<SocketEvent>('onOpen', (e) => {
        if (e.socketId !== id) return;
        this.readyState = this.OPEN;
        this.onopen?.({});
      })
    );

    this.subs.push(
      mod.addListener<MessageEvent>('onMessage', (e) => {
        if (e.socketId !== id) return;
        this.onmessage?.({ data: e.data });
      })
    );

    this.subs.push(
      mod.addListener<CloseEvent>('onClose', (e) => {
        if (e.socketId !== id) return;
        this.readyState = this.CLOSED;
        this.closed = true;
        this.cleanup();
        this.onclose?.({ code: e.code, reason: e.reason, wasClean: e.wasClean });
      })
    );

    this.subs.push(
      mod.addListener<ErrorEvent>('onError', (e) => {
        if (e.socketId !== id) return;
        this.onerror?.({ message: e.message });
      })
    );

    this.subs.push(
      mod.addListener<SpkiEvent>('onPeerSpki', (e) => {
        if (e.socketId !== id) return;
        opts.onPeerSpki?.(e.sha256Hex);
      })
    );

    this.subs.push(
      mod.addListener<PinErrorEvent>('onPinError', (e) => {
        if (e.socketId !== id) return;
        opts.onPinError?.(e.observed, e.allowed);
      })
    );

    mod.createSocket(id, opts.url, opts.allowedSpkiHashes);
  }

  send(data: string): void {
    if (this.closed || this.readyState !== this.OPEN) {
      if (__DEV__) {
        console.warn('[PinnedWebSocket] send() called on non-OPEN socket (readyState:', this.readyState, ')');
      }
      return;
    }
    const mod = getPinned();
    mod.sendMessage(this.socketId, data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = this.CLOSING;
    this.cleanup(); // remove listeners immediately; late onClose from native will be ignored
    const mod = getPinned();
    mod.closeSocket(this.socketId);
  }

  private cleanup(): void {
    for (const sub of this.subs) {
      sub.remove();
    }
    this.subs.length = 0;
  }
}

export function createPinnedWebSocket(opts: PinnedSocketOptions): WebSocketLike {
  if (Platform.OS === 'web') {
    throw new Error(
      '[expo-pinned-websocket] Certificate pinning is not supported on web. ' +
        'Use the native platform build.'
    );
  }
  return new PinnedWebSocket(opts);
}
