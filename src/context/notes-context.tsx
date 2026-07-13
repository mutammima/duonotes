/**
 * Note storage + CRUD for DuoNotes.
 *
 * PLACEHOLDER BACKEND: notes persist to on-device AsyncStorage. Sharing is
 * modelled with `sharedWith` but, without a sync server, the partner's device
 * won't actually receive the note yet. Replace the load/save calls with your
 * backend of choice to enable real-time shared notes across both iPhones.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { generateId } from '@/lib/crypto';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';
import type { LockType, Note } from '@/lib/types';

interface NotesContextValue {
  notes: Note[];
  /** Notes authored by the signed-in user. */
  myNotes: Note[];
  /** Notes shared with (or by) the signed-in user. */
  sharedNotes: Note[];
  loading: boolean;
  getNote: (id: string) => Note | undefined;
  createNote: () => Promise<Note>;
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'lockType'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  toggleShared: (id: string) => Promise<void>;
  setLock: (id: string, lockType: LockType) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

// A placeholder partner id so "shared" notes have somewhere to go until the
// real backend exists. Replace with the partner's real user id after sign-in.
const PARTNER_PLACEHOLDER_ID = 'partner';

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await loadJSON<Note[]>(StorageKeys.notes, []);
      if (stored.length === 0 && user) {
        const seeded = await seedNotes(user.id);
        setNotes(seeded);
        await saveJSON(StorageKeys.notes, seeded);
      } else {
        setNotes(stored);
      }
      setLoading(false);
    })();
  }, [user]);

  const persist = useCallback(async (next: Note[]) => {
    setNotes(next);
    await saveJSON(StorageKeys.notes, next);
  }, []);

  const getNote = useCallback((id: string) => notes.find((n) => n.id === id), [notes]);

  const createNote = useCallback(async (): Promise<Note> => {
    const note: Note = {
      id: await generateId(),
      title: '',
      body: '',
      updatedAt: Date.now(),
      ownerId: user?.id ?? 'me',
      sharedWith: [],
      lockType: 'none',
    };
    await persist([note, ...notes]);
    return note;
  }, [notes, persist, user]);

  const updateNote = useCallback<NotesContextValue['updateNote']>(
    async (id, patch) => {
      await persist(
        notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
      );
    },
    [notes, persist],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await persist(notes.filter((n) => n.id !== id));
    },
    [notes, persist],
  );

  const toggleShared = useCallback(
    async (id: string) => {
      await persist(
        notes.map((n) => {
          if (n.id !== id) return n;
          const isShared = n.sharedWith.length > 0;
          return {
            ...n,
            sharedWith: isShared ? [] : [PARTNER_PLACEHOLDER_ID],
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [notes, persist],
  );

  const setLock = useCallback<NotesContextValue['setLock']>(
    async (id, lockType) => {
      await persist(notes.map((n) => (n.id === id ? { ...n, lockType } : n)));
    },
    [notes, persist],
  );

  const myNotes = useMemo(
    () => notes.filter((n) => n.ownerId === (user?.id ?? 'me')).sort(byRecent),
    [notes, user],
  );
  const sharedNotes = useMemo(() => notes.filter((n) => n.sharedWith.length > 0).sort(byRecent), [notes]);

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

async function seedNotes(ownerId: string): Promise<Note[]> {
  const now = Date.now();
  return [
    {
      id: await generateId(),
      title: 'Our bucket list 🌍',
      body: 'Places we want to go together:\n\n• Kyoto in cherry-blossom season\n• A cabin with no wifi\n• That tiny pasta place we saw online',
      updatedAt: now - 1000 * 60 * 5,
      ownerId,
      sharedWith: [PARTNER_PLACEHOLDER_ID],
      lockType: 'none',
    },
    {
      id: await generateId(),
      title: 'Private journal 🔒',
      body: 'This one is locked. Tap it and unlock with your PIN or Face ID to read it.',
      updatedAt: now - 1000 * 60 * 60,
      ownerId,
      sharedWith: [],
      lockType: 'pin',
    },
  ];
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotes must be used within a <NotesProvider>.');
  return ctx;
}
