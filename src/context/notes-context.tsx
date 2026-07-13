/**
 * Offline-first note storage + CRUD for DuoNotes.
 *
 * Notes are cached locally (AsyncStorage) so the app is fully usable without a
 * connection: you can read, create, edit, delete, lock and share notes offline.
 * Every change is applied to local state immediately and recorded in a small
 * persisted "pending" queue. When connectivity returns (detected via
 * `expo-network`) the queue is flushed to Supabase and the server is re-read to
 * reconcile any changes your partner made.
 *
 * Conflict handling is intentionally simple: last write to reach the server
 * wins (mirroring the `updated_at` trigger in `supabase/schema.sql`). Notes you
 * own are pushed with `upsert`; a partner-owned shared note you edited is pushed
 * with `update`, because RLS blocks a non-owner from inserting.
 */

import { randomUUID } from 'expo-crypto';
import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';
import { supabase, TABLES } from '@/lib/supabase';
import type { LockType, Note, NoteRow } from '@/lib/types';

interface NotesContextValue {
  notes: Note[];
  myNotes: Note[];
  sharedNotes: Note[];
  loading: boolean;
  /** False when the device has no usable internet connection. */
  isOnline: boolean;
  /** Number of local changes waiting to be uploaded. */
  pendingCount: number;
  getNote: (id: string) => Note | undefined;
  createNote: () => Promise<Note | null>;
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'lockType'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  toggleShared: (id: string) => Promise<void>;
  setLock: (id: string, lockType: LockType) => Promise<void>;
  /** Manually push pending changes and pull the latest from the server. */
  syncNow: () => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

interface PendingQueue {
  dirty: string[]; // note ids with local edits to upload
  deleted: string[]; // note ids deleted locally, to delete on the server
}

async function probeOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return true; // If we can't tell, assume online and let the request decide.
  }
}

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const [notes, setNotesState] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Refs let async sync code read current values without stale closures.
  const notesRef = useRef<Note[]>([]);
  const dirtyRef = useRef<Set<string>>(new Set());
  const deletedRef = useRef<Set<string>>(new Set());
  const syncingRef = useRef(false);
  const onlineRef = useRef(true);
  const namesRef = useRef<Record<string, string>>({}); // id -> display name

  // Latest-callback refs so the network/realtime effects don't need to re-bind.
  const syncNowRef = useRef<() => Promise<void>>(async () => {});
  const reconcileRef = useRef<() => Promise<void>>(async () => {});

  const notesKey = uid ? `${StorageKeys.notes}.${uid}` : null;
  const pendingKey = uid ? `${StorageKeys.pending}.${uid}` : null;

  const setNotes = useCallback((next: Note[]) => {
    notesRef.current = next;
    setNotesState(next);
  }, []);

  const refreshPendingCount = useCallback(() => {
    setPendingCount(dirtyRef.current.size + deletedRef.current.size);
  }, []);

  const persistCache = useCallback(
    async (list: Note[]) => {
      if (notesKey) await saveJSON(notesKey, list);
    },
    [notesKey],
  );

  const persistPending = useCallback(async () => {
    if (pendingKey) {
      const queue: PendingQueue = { dirty: [...dirtyRef.current], deleted: [...deletedRef.current] };
      await saveJSON(pendingKey, queue);
    }
  }, [pendingKey]);

  const mapRow = useCallback(
    (row: NoteRow): Note => ({
      id: row.id,
      title: row.title,
      body: row.body,
      lockType: row.lock_type,
      isShared: row.is_shared,
      ownerId: row.owner_id,
      ownerName: namesRef.current[row.owner_id] ?? 'Partner',
      updatedAt: new Date(row.updated_at).getTime(),
    }),
    [],
  );

  // Pull the server's notes and merge them with any local pending changes:
  // server rows are the base, local unsynced edits/creates win, local deletes
  // are removed. Throws on any network/query failure so the caller can mark the
  // app offline without discarding the local cache.
  const reconcile = useCallback(async () => {
    if (!user) return;
    const ids = [user.id, user.partnerId].filter(Boolean) as string[];
    const { data: profiles } = await supabase.from(TABLES.profiles).select('id, name').in('id', ids);
    namesRef.current = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name]));

    const { data, error } = await supabase
      .from(TABLES.notes)
      .select('id, owner_id, title, body, lock_type, is_shared, updated_at')
      .order('updated_at', { ascending: false });
    if (error || !data) throw error ?? new Error('Failed to fetch notes');

    const byId = new Map<string, Note>();
    for (const row of data as NoteRow[]) byId.set(row.id, mapRow(row));
    // Local changes that haven't been uploaded yet take precedence.
    for (const id of dirtyRef.current) {
      const local = notesRef.current.find((n) => n.id === id);
      if (local) byId.set(id, local);
    }
    for (const id of deletedRef.current) byId.delete(id);

    const merged = [...byId.values()];
    setNotes(merged);
    await persistCache(merged);
  }, [user, mapRow, setNotes, persistCache]);

  // Upload everything in the pending queue. Deletes first, then owned notes via
  // upsert, then partner-owned shared notes via update. Ids are cleared from the
  // queue only after their write succeeds, so a failure just leaves them queued.
  const flushPending = useCallback(async () => {
    if (!user) return;

    const deletes = [...deletedRef.current];
    if (deletes.length) {
      const { error } = await supabase.from(TABLES.notes).delete().in('id', deletes);
      if (error) throw error;
      deletedRef.current = new Set();
    }

    const owned: Record<string, unknown>[] = [];
    const foreign: Note[] = [];
    for (const id of dirtyRef.current) {
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) {
        dirtyRef.current.delete(id);
        continue;
      }
      if (n.ownerId === user.id) {
        owned.push({
          id: n.id,
          owner_id: user.id,
          title: n.title,
          body: n.body,
          lock_type: n.lockType,
          is_shared: n.isShared,
        });
      } else {
        foreign.push(n);
      }
    }

    if (owned.length) {
      const { error } = await supabase.from(TABLES.notes).upsert(owned, { onConflict: 'id' });
      if (error) throw error;
      for (const row of owned) dirtyRef.current.delete(row.id as string);
    }

    for (const n of foreign) {
      const { error } = await supabase
        .from(TABLES.notes)
        .update({ title: n.title, body: n.body, lock_type: n.lockType, is_shared: n.isShared })
        .eq('id', n.id);
      if (error) throw error;
      dirtyRef.current.delete(n.id);
    }

    await persistPending();
    refreshPendingCount();
  }, [user, persistPending, refreshPendingCount]);

  const syncNow = useCallback(async () => {
    if (!user || syncingRef.current) return;
    syncingRef.current = true;
    try {
      await flushPending();
      await reconcile();
      onlineRef.current = true;
      setIsOnline(true);
    } catch {
      onlineRef.current = false;
      setIsOnline(false);
    } finally {
      syncingRef.current = false;
    }
  }, [user, flushPending, reconcile]);

  useEffect(() => {
    syncNowRef.current = syncNow;
    reconcileRef.current = reconcile;
  }, [syncNow, reconcile]);

  // Mark a note as needing upload and persist the queue.
  const markDirty = useCallback(
    async (id: string) => {
      dirtyRef.current.add(id);
      refreshPendingCount();
      await persistPending();
    },
    [refreshPendingCount, persistPending],
  );

  // Load the local cache + pending queue for this user (instant, works offline),
  // then reconcile with the server if we're online.
  useEffect(() => {
    let active = true;
    if (!uid) {
      setNotes([]);
      dirtyRef.current = new Set();
      deletedRef.current = new Set();
      setPendingCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const cached = await loadJSON<Note[]>(`${StorageKeys.notes}.${uid}`, []);
      const queue = await loadJSON<PendingQueue>(`${StorageKeys.pending}.${uid}`, { dirty: [], deleted: [] });
      if (!active) return;

      dirtyRef.current = new Set(queue.dirty);
      deletedRef.current = new Set(queue.deleted);
      refreshPendingCount();
      setNotes(cached);
      setLoading(false);

      const online = await probeOnline();
      if (!active) return;
      onlineRef.current = online;
      setIsOnline(online);
      if (online) await syncNowRef.current();
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Live updates from the server + react to connectivity changes.
  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel('notes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.notes }, () => {
        // A remote change arrived — pull and merge (keeps local pending edits).
        reconcileRef.current().catch(() => {});
      })
      .subscribe();

    const subscription = Network.addNetworkStateListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      const wasOnline = onlineRef.current;
      onlineRef.current = online;
      setIsOnline(online);
      // Just regained connectivity — push whatever's queued and refresh.
      if (online && !wasOnline) syncNowRef.current();
    });

    return () => {
      supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [uid]);

  const getNote = useCallback((id: string) => notes.find((n) => n.id === id), [notes]);

  const createNote = useCallback(async (): Promise<Note | null> => {
    if (!user) return null;
    // Client-generated id (the schema's `id` column accepts it) so creation
    // works with no connection. It syncs on the next flush.
    const note: Note = {
      id: randomUUID(),
      title: '',
      body: '',
      lockType: 'none',
      isShared: false,
      ownerId: user.id,
      ownerName: user.name,
      updatedAt: Date.now(),
    };
    const next = [note, ...notesRef.current];
    setNotes(next);
    await persistCache(next);
    await markDirty(note.id);
    void syncNow();
    return note;
  }, [user, setNotes, persistCache, markDirty, syncNow]);

  const updateNote = useCallback<NotesContextValue['updateNote']>(
    async (id, patch) => {
      const next = notesRef.current.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n));
      setNotes(next);
      await persistCache(next);
      await markDirty(id);
      void syncNow();
    },
    [setNotes, persistCache, markDirty, syncNow],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const next = notesRef.current.filter((n) => n.id !== id);
      setNotes(next);
      await persistCache(next);
      dirtyRef.current.delete(id);
      deletedRef.current.add(id);
      refreshPendingCount();
      await persistPending();
      void syncNow();
    },
    [setNotes, persistCache, refreshPendingCount, persistPending, syncNow],
  );

  const toggleShared = useCallback(
    async (id: string) => {
      const current = notesRef.current.find((n) => n.id === id);
      if (!current) return;
      const next = notesRef.current.map((n) =>
        n.id === id ? { ...n, isShared: !current.isShared, updatedAt: Date.now() } : n,
      );
      setNotes(next);
      await persistCache(next);
      await markDirty(id);
      void syncNow();
    },
    [setNotes, persistCache, markDirty, syncNow],
  );

  const setLock = useCallback<NotesContextValue['setLock']>(
    async (id, lockType) => {
      const next = notesRef.current.map((n) => (n.id === id ? { ...n, lockType, updatedAt: Date.now() } : n));
      setNotes(next);
      await persistCache(next);
      await markDirty(id);
      void syncNow();
    },
    [setNotes, persistCache, markDirty, syncNow],
  );

  const myNotes = useMemo(
    () => notes.filter((n) => n.ownerId === user?.id).sort(byRecent),
    [notes, user],
  );
  const sharedNotes = useMemo(() => notes.filter((n) => n.isShared).sort(byRecent), [notes]);

  const value = useMemo<NotesContextValue>(
    () => ({
      notes,
      myNotes,
      sharedNotes,
      loading,
      isOnline,
      pendingCount,
      getNote,
      createNote,
      updateNote,
      deleteNote,
      toggleShared,
      setLock,
      syncNow,
    }),
    [
      notes,
      myNotes,
      sharedNotes,
      loading,
      isOnline,
      pendingCount,
      getNote,
      createNote,
      updateNote,
      deleteNote,
      toggleShared,
      setLock,
      syncNow,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

function byRecent(a: Note, b: Note): number {
  return b.updatedAt - a.updatedAt;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within a <NotesProvider>.');
  return ctx;
}
