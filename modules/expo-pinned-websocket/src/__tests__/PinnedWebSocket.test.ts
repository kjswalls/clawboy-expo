/**
 * Unit tests for the PinnedWebSocket JS wrapper.
 *
 * Covers:
 *  1. Events on socket A don't reach a concurrently open socket B (socketId routing guard).
 *  2. cleanup() removes all subscriptions after onClose fires.
 *  3. send() on a CLOSING/CLOSED socket is a no-op (warns in __DEV__).
 *  4. onError then onClose both reach the correct handlers in order.
 *  5. onPinError routes to opts.onPinError callback.
 *  6. onPeerSpki routes to opts.onPeerSpki callback.
 *
 * Note: PinnedWebSocket.ts holds module-level singletons (_nativeModule, _emitter).
 * We use jest.resetModules() + jest.doMock() in beforeEach so each test gets a
 * fresh module load with clean singleton state.
 */

// ── Mock infrastructure ───────────────────────────────────────────────────────

type Listener = (payload: unknown) => void;

/**
 * Shared listener registry. Populated by the mocked emitter's `addListener`
 * and pruned by the returned subscription's `remove()`. Reset in beforeEach.
 */
const listenerMap: Record<string, Listener[]> = {};

const nativeModule = {
  createSocket: jest.fn(),
  sendMessage: jest.fn(),
  closeSocket: jest.fn(),
};

function resetListenerMap(): void {
  for (const key of Object.keys(listenerMap)) {
    delete listenerMap[key];
  }
}

function setupMocks(): void {
  // Build a fresh emitter that writes into the shared listenerMap.
  const emitter = {
    addListener(event: string, listener: Listener) {
      if (!listenerMap[event]) listenerMap[event] = [];
      listenerMap[event].push(listener);
      return {
        remove: jest.fn(() => {
          const arr = listenerMap[event];
          if (arr) {
            const idx = arr.indexOf(listener);
            if (idx !== -1) arr.splice(idx, 1);
          }
        }),
      };
    },
  };

  // jest.doMock (not hoisted) — safe to reference local variables.
  jest.doMock('expo-modules-core', () => ({
    requireNativeModule: jest.fn(() => nativeModule),
    EventEmitter: jest.fn(() => emitter),
  }));

  jest.doMock('react-native', () => ({
    Platform: { OS: 'ios' },
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPinnedWebSocket = any;

function emit(event: string, payload: unknown): void {
  [...(listenerMap[event] ?? [])].forEach((fn) => fn(payload));
}

function getModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require('../PinnedWebSocket') as typeof import('../PinnedWebSocket');
}

function makeSocket(
  mod: ReturnType<typeof getModule>,
  overrides: Partial<{ url: string; allowedSpkiHashes: string[]; onPeerSpki: (h: string) => void; onPinError: (o: string, a: string[]) => void }> = {}
): AnyPinnedWebSocket {
  return new mod.PinnedWebSocket({
    url: 'wss://test.example',
    allowedSpkiHashes: [],
    ...overrides,
  });
}

function lastSocketId(): number {
  const calls = nativeModule.createSocket.mock.calls;
  return calls[calls.length - 1][0] as number;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetListenerMap();
  jest.clearAllMocks();
  jest.resetModules(); // fresh module = fresh _nativeModule/_emitter singletons
  setupMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('socketId routing guard', () => {
  it('events for socket A do not reach socket B handlers', () => {
    const mod = getModule();
    const openA = jest.fn();
    const openB = jest.fn();
    const msgA = jest.fn();
    const msgB = jest.fn();

    const socketA = makeSocket(mod);
    socketA.onopen = openA;
    socketA.onmessage = msgA;
    const idA = lastSocketId();

    const socketB = makeSocket(mod);
    socketB.onopen = openB;
    socketB.onmessage = msgB;
    const idB = lastSocketId();

    expect(idA).not.toBe(idB);

    emit('onOpen', { socketId: idA });
    emit('onMessage', { socketId: idA, data: 'hello from A' });

    expect(openA).toHaveBeenCalledTimes(1);
    expect(msgA).toHaveBeenCalledWith({ data: 'hello from A' });
    expect(openB).not.toHaveBeenCalled();
    expect(msgB).not.toHaveBeenCalled();

    emit('onOpen', { socketId: idB });
    expect(openB).toHaveBeenCalledTimes(1);
    expect(openA).toHaveBeenCalledTimes(1); // unchanged
  });
});

describe('cleanup on close', () => {
  it('removes all subscriptions when onClose fires', () => {
    const mod = getModule();
    const onclose = jest.fn();
    const onmessage = jest.fn();

    const socket = makeSocket(mod);
    socket.onclose = onclose;
    socket.onmessage = onmessage;
    const id = lastSocketId();

    emit('onClose', { socketId: id, code: 1000, reason: '', wasClean: true });

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(socket.CLOSED);

    // After close, emitting further events should reach no handlers.
    emit('onMessage', { socketId: id, data: 'late message' });
    expect(onmessage).not.toHaveBeenCalled();
  });

  it('calling close() removes subscriptions immediately; late native onClose is ignored', () => {
    const mod = getModule();
    const onclose = jest.fn();
    const socket = makeSocket(mod);
    socket.onclose = onclose;
    const id = lastSocketId();

    socket.close();

    emit('onClose', { socketId: id, code: 1000, reason: '', wasClean: true });
    expect(onclose).not.toHaveBeenCalled();
  });
});

describe('send() on non-OPEN socket', () => {
  it('is a no-op when socket is CLOSED', () => {
    const mod = getModule();
    const socket = makeSocket(mod);
    const id = lastSocketId();

    emit('onClose', { socketId: id, code: 1000, reason: '', wasClean: true });
    expect(socket.readyState).toBe(socket.CLOSED);

    socket.send('should not send');
    expect(nativeModule.sendMessage).not.toHaveBeenCalled();
  });

  it('is a no-op when socket is CLOSING (after close() called)', () => {
    const mod = getModule();
    const socket = makeSocket(mod);
    socket.close();
    expect(socket.readyState).toBe(socket.CLOSING);

    socket.send('should not send');
    expect(nativeModule.sendMessage).not.toHaveBeenCalled();
  });

  it('calls sendMessage when socket is OPEN', () => {
    const mod = getModule();
    const socket = makeSocket(mod);
    const id = lastSocketId();
    emit('onOpen', { socketId: id });

    socket.send('hello');
    expect(nativeModule.sendMessage).toHaveBeenCalledWith(id, 'hello');
  });
});

describe('onError + onClose ordering', () => {
  it('delivers onError before onClose, both to the correct handlers', () => {
    const mod = getModule();
    const order: string[] = [];
    const socket = makeSocket(mod);
    socket.onerror = () => order.push('error');
    socket.onclose = () => order.push('close');
    const id = lastSocketId();

    emit('onError', { socketId: id, message: 'TLS failure' });
    emit('onClose', { socketId: id, code: 1006, reason: 'TLS failure', wasClean: false });

    expect(order).toEqual(['error', 'close']);
  });

  it('passes error message and close code through to handlers', () => {
    const mod = getModule();
    const onerror = jest.fn();
    const onclose = jest.fn();
    const socket = makeSocket(mod);
    socket.onerror = onerror;
    socket.onclose = onclose;
    const id = lastSocketId();

    emit('onError', { socketId: id, message: 'Connection reset' });
    emit('onClose', { socketId: id, code: 1006, reason: 'Connection reset', wasClean: false });

    expect(onerror).toHaveBeenCalledWith({ message: 'Connection reset' });
    expect(onclose).toHaveBeenCalledWith({ code: 1006, reason: 'Connection reset', wasClean: false });
  });
});

describe('onPinError callback', () => {
  it('routes to opts.onPinError with observed hash and allowed list', () => {
    const mod = getModule();
    const onPinError = jest.fn();
    const OBSERVED = 'aa'.repeat(32);
    const ALLOWED = 'bb'.repeat(32);

    makeSocket(mod, { onPinError, allowedSpkiHashes: [ALLOWED] });
    const id = lastSocketId();

    emit('onPinError', { socketId: id, observed: OBSERVED, allowed: [ALLOWED] });

    expect(onPinError).toHaveBeenCalledWith(OBSERVED, [ALLOWED]);
  });

  it('does not reach a different socket onPinError handler', () => {
    const mod = getModule();
    const onPinError = jest.fn();
    const OBSERVED = 'aa'.repeat(32);

    makeSocket(mod); // socket A — no handler
    const idA = lastSocketId();

    makeSocket(mod, { onPinError }); // socket B — has handler

    // Emit for socket A only — socket B's handler should NOT fire.
    emit('onPinError', { socketId: idA, observed: OBSERVED, allowed: [] });
    expect(onPinError).not.toHaveBeenCalled();
  });
});

describe('onPeerSpki callback', () => {
  it('routes to opts.onPeerSpki with the observed hash', () => {
    const mod = getModule();
    const onPeerSpki = jest.fn();
    const HASH = 'cc'.repeat(32);

    makeSocket(mod, { onPeerSpki });
    const id = lastSocketId();

    emit('onPeerSpki', { socketId: id, sha256Hex: HASH });

    expect(onPeerSpki).toHaveBeenCalledWith(HASH);
  });
});

describe('createPinnedWebSocket', () => {
  it('returns a PinnedWebSocket instance on a non-web platform', () => {
    const mod = getModule();
    const ws = mod.createPinnedWebSocket({ url: 'wss://test.example', allowedSpkiHashes: [] });
    expect(ws).toBeInstanceOf(mod.PinnedWebSocket);
  });

  it('throws synchronously when Platform.OS is web', () => {
    jest.resetModules();
    jest.doMock('expo-modules-core', () => ({
      requireNativeModule: jest.fn(() => nativeModule),
      EventEmitter: jest.fn(() => ({
        addListener: jest.fn(() => ({ remove: jest.fn() })),
      })),
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    const mod = getModule();
    expect(() =>
      mod.createPinnedWebSocket({ url: 'wss://test.example', allowedSpkiHashes: [] })
    ).toThrow(/not supported on web/);
  });
});
