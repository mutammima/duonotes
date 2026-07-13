/**
 * Note storage + CRUD for DuoNotes, backed by Supabase.
 *
 * Notes live in the `notes` table and are streamed to every signed-in device
 * via Supabase Realtime, so a note your partner shares (or edits) shows up on
 * your phone without a manual refresh. Row-Level Security (see
 * `supabase/schema.sql`) guarantees you only ever receive your own notes and
 * the ones your partner has shared with you.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { supabase, TABLES } from '@/lib/supabase';
import type { LockType, Note, NoteRow } from '@/lib/types';

interface NotesContextValue {
  notes: Note[];
  myNotes: Note[];
  sharedNotes: Note[];
  loading: boolean;
  getNote: (id: string) => Note | undefined;
  createNote: () => Promise<Note | null>;
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'lockType'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  toggleShared: (id: string) => Promise<void>;
  setLock: (id: string, lockType: LockType) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // id -> display name, so shared notes can show who wrote them.
  const namesRef = useRef<Record<string, string>>({});

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

  const fetchNotes = useCallback(async () => {
    if (!user) return;
    // Resolve display names for me + my partner (RLS lets us read profiles).
    const ids = [user.id, user.partnerId].filter(Boolean) as string[];
    const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', ids);
    namesRef.current = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name]));

    const { data, error } = await supabase
      .from(TABLES.notes)
      .select('id, owner_id, title, body, lock_type, is_shared, updated_at')
      .order('updated_at', { ascending: false });
    if (!error && data) setNotes((data as NoteRow[]).map(mapRow));
    setLoading(false);
  }, [user, mapRow]);

  // Initial load + live updates whenever notes change on the server.
  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    setLoading(true);
    fetchNotes();

    const channel = supabase
      .channel('notes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.notes }, () => {
        fetchNotes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotes]);

  const getNote = useCallback((id: string) => notes.find((n) => n.id === id), [notes]);

  // Optimistically patch local state so the UI feels instant; the realtime
  // event that follows our own write simply confirms it.
  const patchLocal = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const createNote = useCallback(async (): Promise<Note | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from(TABLES.notes)
      .insert({ owner_id: user.id, title: '', body: '' })
      .select('id, owner_id, title, body, lock_type, is_shared, updated_at')
      .single();
    if (error || !data) return null;
    const note = mapRow(data as NoteRow);
    setNotes((prev) => [note, ...prev]);
    return note;
  }, [user, mapRow]);

  const updateNote = useCallback<NotesContextValue['updateNote']>(
    async (id, patch) => {
      patchLocal(id, { ...patch, updatedAt: Date.now() });
      const dbPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.body !== undefined) dbPatch.body = patch.body;
      if (patch.lockType !== undefined) dbPatch.lock_type = patch.lockType;
      await supabase.from(TABLES.notes).update(dbPatch).eq('id', id);
    },
    [patchLocal],
  );

  const deleteNote = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await supabase.from(TABLES.notes).delete().eq('id', id);
  }, []);

  const toggleShared = useCallback(
    async (id: string) => {
      const current = notes.find((n) => n.id === id);
      if (!current) return;
      const next = !current.isShared;
      patchLocal(id, { isShared: next });
      await supabase.from(TABLES.notes).update({ is_shared: next }).eq('id', id);
    },
    [notes, patchLocal],
  );

  const setLock = useCallback<NotesContextValue['setLock']>(
    async (id, lockType) => {
      patchLocal(id, { lockType });
      await supabase.from(TABLES.notes).update({ lock_type: lockType }).eq('id', id);
    },
    [patchLocal],
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
      getNote,
      createNote,
      updateNote,
      deleteNote,
      toggleShared,
      setLock,
    }),
    [notes, myNotes, sharedNotes, loading, getNote, createNote, updateNote, deleteNote, toggleShared, setLock],
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
