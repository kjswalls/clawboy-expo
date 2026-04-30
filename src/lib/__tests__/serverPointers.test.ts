/**
 * Unit tests for src/lib/supabase/serverPointers.ts
 *
 * All Supabase interactions are mocked so no real credentials are needed.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── Supabase client mock ───────────────────────────────────────────────────

const mockOrder = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });
const mockUpsert = jest.fn().mockResolvedValue({ error: null });

const mockEqUrl = jest.fn().mockResolvedValue({ error: null });
const mockEqAccount = jest.fn().mockReturnValue({ eq: mockEqUrl });
const mockDelete = jest.fn().mockReturnValue({ eq: mockEqAccount });

const mockGetUser = jest.fn();

const mockFrom = jest.fn().mockReturnValue({
  select: mockSelect,
  upsert: mockUpsert,
  delete: mockDelete,
});

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

import {
  listServerPointers,
  upsertServerPointer,
  deleteServerPointerByUrl,
  bulkUpsertServerPointers,
} from '../supabase/serverPointers';

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset call counts but preserve implementations.
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockOrder.mockClear();
  mockUpsert.mockClear().mockResolvedValue({ error: null });
  mockDelete.mockClear();
  mockEqAccount.mockClear();
  mockEqUrl.mockClear().mockResolvedValue({ error: null });
  mockGetUser.mockClear();
});

// ── listServerPointers ─────────────────────────────────────────────────────

describe('listServerPointers', () => {
  it('returns an empty array when Supabase returns an error', async () => {
    mockOrder.mockReturnValueOnce({ data: null, error: new Error('network') });
    const result = await listServerPointers();
    expect(result).toEqual([]);
  });

  it('returns an empty array when data is null', async () => {
    mockOrder.mockReturnValueOnce({ data: null, error: null });
    const result = await listServerPointers();
    expect(result).toEqual([]);
  });

  it('returns mapped rows on success', async () => {
    const rows = [
      { id: 'uuid-1', url: 'wss://a.example.com', label: 'Server A' },
      { id: 'uuid-2', url: 'wss://b.example.com', label: 'Server B' },
    ];
    mockOrder.mockReturnValueOnce({ data: rows, error: null });
    const result = await listServerPointers();
    expect(result).toEqual(rows);
  });

  it('queries the correct table with ordered select', async () => {
    mockOrder.mockReturnValueOnce({ data: [], error: null });
    await listServerPointers();
    expect(mockFrom).toHaveBeenCalledWith('server_profile_pointers');
    expect(mockSelect).toHaveBeenCalledWith('id, url, label');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });
});

// ── upsertServerPointer ────────────────────────────────────────────────────

describe('upsertServerPointer', () => {
  it('is a no-op when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await upsertServerPointer({ url: 'wss://a.example.com', label: 'A' });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('upserts with account_id from the current user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-abc' } } });
    await upsertServerPointer({ url: 'wss://a.example.com', label: 'Server A' });
    expect(mockFrom).toHaveBeenCalledWith('server_profile_pointers');
    expect(mockUpsert).toHaveBeenCalledWith(
      { account_id: 'user-abc', url: 'wss://a.example.com', label: 'Server A' },
      { onConflict: 'account_id,url' }
    );
  });
});

// ── deleteServerPointerByUrl ───────────────────────────────────────────────

describe('deleteServerPointerByUrl', () => {
  it('is a no-op when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await deleteServerPointerByUrl('wss://a.example.com');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes by account_id and url', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-xyz' } } });
    await deleteServerPointerByUrl('wss://gone.example.com');
    expect(mockFrom).toHaveBeenCalledWith('server_profile_pointers');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEqAccount).toHaveBeenCalledWith('account_id', 'user-xyz');
    expect(mockEqUrl).toHaveBeenCalledWith('url', 'wss://gone.example.com');
  });
});

// ── bulkUpsertServerPointers ───────────────────────────────────────────────

describe('bulkUpsertServerPointers', () => {
  it('is a no-op with an empty list', async () => {
    await bulkUpsertServerPointers([]);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('is a no-op when not signed in', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await bulkUpsertServerPointers([{ url: 'wss://a.example.com', label: 'A' }]);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('upserts all items with account_id', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-bulk' } } });
    const items = [
      { url: 'wss://a.example.com', label: 'Alpha' },
      { url: 'wss://b.example.com', label: 'Beta' },
    ];
    await bulkUpsertServerPointers(items);
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        { account_id: 'user-bulk', url: 'wss://a.example.com', label: 'Alpha' },
        { account_id: 'user-bulk', url: 'wss://b.example.com', label: 'Beta' },
      ],
      { onConflict: 'account_id,url' }
    );
  });
});
