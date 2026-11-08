/**
 * Unsaved draft checkpoint helpers using sessionStorage.
 * Protects complex edits (binder custom lists, maybeboards, notes) from tab reloads or navigation.
 */

const SESSION_PREFIX = 'hub_draft_';

export interface DraftCheckpoint<T = unknown> {
  key: string;
  at: number;
  data: T;
}

/** Save a draft checkpoint to sessionStorage. */
export function setDraftCheckpoint<T>(key: string, data: T): void {
  try {
    const payload: DraftCheckpoint<T> = {
      key,
      at: Date.now(),
      data,
    };
    sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed to save draft checkpoint', e);
  }
}

/** Retrieve an existing draft checkpoint. */
export function getDraftCheckpoint<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (!raw) return null;
    const payload: DraftCheckpoint<T> = JSON.parse(raw);
    return payload?.data ?? null;
  } catch (e) {
    console.warn('Failed to get draft checkpoint', e);
    return null;
  }
}

/** Clear a draft checkpoint once saved or discarded. */
export function clearDraftCheckpoint(key: string): void {
  try {
    sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
  } catch (e) {
    console.warn('Failed to clear draft checkpoint', e);
  }
}

/** Check if a draft exists and differs from baseline. */
export function hasDraftDifference<T>(key: string, baseline: T): boolean {
  const draft = getDraftCheckpoint<T>(key);
  if (draft === null || draft === undefined) return false;
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}
