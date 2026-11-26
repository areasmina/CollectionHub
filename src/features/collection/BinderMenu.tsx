import { useEffect, useRef, useState } from 'react';
import { resetProfile } from '../../lib/actions';
import { db } from '../../lib/db';
import { UNASSIGNED_NAME, UNASSIGNED_PROFILE } from '../../lib/deckedit';
import { allBindersCsv, allBindersText, binderFile, binderShareText, collectionCsv, collectionText, download, EXPORT_FORMATS, type ExportFormat } from '../../lib/export';
import { haptic as buzz, HAPTIC_NOTE, hapticsOn, hapticsSupported, setHaptics } from '../../lib/haptics';
import { useStored } from '../../views/shared';

const FORMAT_LABEL: Record<ExportFormat, string> = { csv: 'CSV', txt: 'TXT', collectionhub: 'CollectionHub' };

export type SyncItem = { label: string; alert: boolean; open: () => void };

/**
 * The binder control: the binder's name with ▾. Switches binders, adds/renames/resets/deletes one,
 * exports CSV/TXT/CollectionHub, shares, and holds SYNC + haptics toggle.
 */
export function BinderMenu({
  profile,
  name,
  count,
  binders,
  onPick,
  sync,
}: {
  profile: number;
  name: string;
  count: number;
  binders: { id: number; name: string }[];
  onPick?: (id: number) => void;
  sync?: SyncItem;
}) {
  const [open, setOpen] = useState(false);
  const [hapt, setHapt] = useState(hapticsOn);
  const [note, setNote] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    const raf = requestAnimationFrame(() => {
      const el = box.current?.querySelector('.bmenu') as HTMLElement | null;
      if (!el) return;
      el.style.removeProperty('left');
      el.style.removeProperty('right');
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth - 12) {
        el.style.setProperty('left', 'auto', 'important');
        el.style.setProperty('right', '0', 'important');
        const r2 = el.getBoundingClientRect();
        if (r2.left < 12) {
          el.style.setProperty('right', `${r2.left - 12}px`, 'important');
        }
      }
    });
    return () => (cancelAnimationFrame(raf), removeEventListener('pointerdown', out), removeEventListener('keydown', esc));
  }, [open]);

  const act = (f: () => unknown) => () => (setOpen(false), f());

  async function add() {
    const id = Math.max(0, ...binders.map((b) => b.id)) + 1;
    const nm = prompt('Name the new binder', `Binder ${id}`)?.trim();
    if (!nm) return;
    await db.profiles.add({ id, name: nm });
    buzz('success');
    onPick?.(id);
  }
  async function rename() {
    const nm = prompt('Rename this binder', name)?.trim();
    if (nm && nm !== name) await db.profiles.update(profile, { name: nm });
  }
  async function remove() {
    const decks = await db.decks.where('profile').equals(profile).count();
    if (!confirm(`Delete ${name}? All ${count} cards will be safely released to Unassigned Cards${decks ? ` and ${decks} deck${decks === 1 ? '' : 's'} will be removed` : ''}.`)) return;
    buzz('warn');
    await db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
      const binderEntries = await db.entries.where('profile').equals(profile).toArray();
      const unassignedEntries = await db.entries.where('profile').equals(UNASSIGNED_PROFILE).toArray();

      for (const entry of binderEntries) {
        const destMatch = unassignedEntries.find((u) => u.cardId === entry.cardId && !!u.foil === !!entry.foil && (u.list ?? '') === (entry.list ?? ''));
        if (destMatch) {
          await db.entries.update(destMatch.id!, { qty: destMatch.qty + entry.qty });
        } else {
          await db.entries.add({
            profile: UNASSIGNED_PROFILE,
            cardId: entry.cardId,
            name: entry.name,
            qty: entry.qty,
            set: entry.set,
            cn: entry.cn,
            foil: entry.foil,
            added: entry.added ?? Date.now(),
            list: entry.list,
          });
        }
        await db.entries.delete(entry.id!);
      }

      await db.decks.where('profile').equals(profile).delete();
      await db.profiles.delete(profile);
    });
    onPick?.(UNASSIGNED_PROFILE);
  }

  const fileOf = (nm: string, ext: string) => `${nm.replace(/[^\w-]+/g, '_') || 'binder'}.${ext}`;
  const binderEntries = () => db.entries.where('profile').equals(profile).sortBy('name');
  const [fmt, setFmt] = useStored<ExportFormat>('ch:exportfmt', 'csv', EXPORT_FORMATS);
  const day = () => new Date().toISOString().slice(0, 10);

  async function exportBinder() {
    const es = await binderEntries();
    if (!es.length) return setNote(`${name} has no cards to export.`);
    if (fmt === 'csv') download(fileOf(name, 'csv'), collectionCsv(es), 'text/csv');
    else if (fmt === 'txt') download(fileOf(name, 'txt'), collectionText(es));
    else {
      const [prof, decks] = await Promise.all([db.profiles.get(profile), db.decks.where('profile').equals(profile).toArray()]);
      download(fileOf(name, 'collectionhub.json'), binderFile([prof ?? { id: profile, name }], es, decks), 'application/json');
    }
    buzz('success');
  }

  async function exportAll() {
    const [all, profs, decks] = await Promise.all([db.entries.toArray(), db.profiles.toArray(), db.decks.toArray()]);
    if (!all.length) return setNote('There are no cards in any binder yet.');
    const named = new Map<number, string>(profs.map((p) => [p.id, p.name]));
    named.set(UNASSIGNED_PROFILE, UNASSIGNED_NAME);
    const order = [...new Set([...binders.map((b) => b.id).filter((id) => id !== UNASSIGNED_PROFILE), ...profs.map((p) => p.id).filter((id) => id !== UNASSIGNED_PROFILE), UNASSIGNED_PROFILE, ...all.map((e) => e.profile)])];
    const groups = order
      .map((id) => ({ name: named.get(id) ?? `Binder ${id}`, entries: all.filter((e) => e.profile === id).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((g) => g.entries.length);
    const base = `collectionhub-all-binders-${day()}`;
    if (fmt === 'csv') download(`${base}.csv`, allBindersCsv(groups), 'text/csv');
    else if (fmt === 'txt') download(`${base}.txt`, allBindersText(groups));
    else download(`${base}.json`, binderFile(profs, all, decks), 'application/json');
    buzz('success');
    setNote(`Saved ${groups.length} binder${groups.length === 1 ? '' : 's'}, ${all.reduce((n, e) => n + e.qty, 0).toLocaleString()} cards, in one ${FORMAT_LABEL[fmt]} file.`);
  }

  async function share() {
    const es = await binderEntries();
    if (!es.length) return setNote(`${name} has no cards to share.`);
    const text = binderShareText(name, es);
    const canShare = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
    if (canShare) {
      const f = typeof File === 'function' ? new File([text], fileOf(name, 'txt'), { type: 'text/plain' }) : null;
      const data: ShareData = f && navigator.canShare?.({ files: [f] }) ? { title: name, files: [f] } : { title: name, text };
      setOpen(false);
      await navigator.share(data).catch(() => {});
      return;
    }
    const ok = await (navigator.clipboard?.writeText(text).then(
      () => true,
      () => false,
    ) ?? Promise.resolve(false));
    if (ok) buzz('success');
    setNote(ok ? `Copied ${name}'s list (${es.length.toLocaleString()} unique cards). Paste it anywhere; it imports back here, into Moxfield or Archidekt.` : "Couldn't copy: this browser blocked the clipboard. Use EXPORT THIS BINDER instead.");
  }

  return (
    <div className="bindermenu" ref={box}>
      <button className={`bmbtn${sync?.alert ? ' alert' : ''}`} aria-expanded={open} aria-haspopup="menu" onClick={() => (buzz('open'), setNote(''), setOpen(!open))}>
        <span className="lbl">BINDER</span>
        <b>{name}</b>
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="bmenu" role="menu" aria-label="Binders">
          {!binders.some((b) => b.id === UNASSIGNED_PROFILE) && (
            <button role="menuitemradio" aria-checked={profile === UNASSIGNED_PROFILE} onClick={act(() => profile !== UNASSIGNED_PROFILE && onPick?.(UNASSIGNED_PROFILE))}>
              {profile === UNASSIGNED_PROFILE ? '● ' : '○ '}
              {UNASSIGNED_NAME}
            </button>
          )}
          {binders.map((b) => (
            <button key={b.id} role="menuitemradio" aria-checked={b.id === profile} onClick={act(() => b.id !== profile && onPick?.(b.id))}>
              {b.id === profile ? '● ' : '○ '}
              {b.name}
            </button>
          ))}
          <button role="menuitem" onClick={act(add)}>
            + NEW BINDER
          </button>
          <button role="menuitem" onClick={act(rename)}>
            RENAME BINDER
          </button>
          <hr />
          <div className="bmfmt" role="group" aria-label="Export file type">
            <span className="lbl">FILE</span>
            {EXPORT_FORMATS.map((f) => (
              <button key={f} type="button" role="menuitemradio" aria-checked={fmt === f} className={fmt === f ? 'on' : ''} onClick={() => (buzz('select'), setFmt(f))}>
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          <button role="menuitem" disabled={!count} onClick={act(exportBinder)}>
            EXPORT THIS BINDER <small>{FORMAT_LABEL[fmt]}</small>
          </button>
          <button role="menuitem" onClick={exportAll}>
            EXPORT ALL BINDERS <small>one {FORMAT_LABEL[fmt]} file</small>
          </button>
          <button role="menuitem" disabled={!count} onClick={share}>
            SHARE THIS BINDER <small>card list</small>
          </button>
          <hr />
          {sync && (
            <button role="menuitem" className={sync.alert ? 'alert' : ''} onClick={act(sync.open)}>
              SYNC <small>{sync.label}</small>
            </button>
          )}
          {hapticsSupported() && (
            <button role="menuitemcheckbox" aria-checked={hapt} onClick={() => (setNote(HAPTIC_NOTE[setHaptics(!hapt)]), setHapt(!hapt))}>
              {hapt ? '◉' : '○'} Haptics {hapt ? 'on' : 'off'}
            </button>
          )}
          {note && (
            <p className="small hapnote" role="status">
              {note}
            </p>
          )}
          <hr />
          <button role="menuitem" className="danger" disabled={!count} onClick={act(() => confirm(`Delete all cards in ${name}? Decks stay.`) && resetProfile(profile))}>
            RESET (EMPTY BINDER)
          </button>
          {binders.filter((b) => b.id !== UNASSIGNED_PROFILE).length > 1 && profile !== UNASSIGNED_PROFILE && (
            <button role="menuitem" className="danger" onClick={act(remove)}>
              DELETE THIS BINDER
            </button>
          )}
        </div>
      )}
    </div>
  );
}
