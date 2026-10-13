// Pure vault layout: where daily notes and new attachments go. No fs here —
// the caller passes the vault's Obsidian settings (parsed JSON, or null) and an
// exists(rel) check for top-level folders.
//
// Daily notes:  the folder from Obsidian's daily-notes settings (when its date
//               format is the default YYYY-MM-DD), else an existing Günlük/
//               (vaults Mufka created before), else Daily/.
// Attachments:  Obsidian's "attachmentFolderPath" — "/" = vault root,
//               "./x" = x next to each note, "x" = a vault folder — else an
//               existing Ekler/, else Attachments/.
// Templates:    Obsidian's templates folder (templates.json), else an existing
//               Templates/, else none; plus its date/time formats and the
//               daily notes template (daily-notes.json "template").

import { normalizeRel } from './attach.mjs';

export const DEFAULT_DAILY = 'Daily';
export const LEGACY_DAILY = 'Günlük';
export const DEFAULT_ATTACHMENTS = 'Attachments';
export const LEGACY_ATTACHMENTS = 'Ekler';

// obsidian: { dailyNotes?: { folder?, format?, template? }, app?: { attachmentFolderPath? },
//             templates?: { folder?, dateFormat?, timeFormat? } } | null
// Returns { daily, attachments, relative, templates, dailyTemplate, dateFormat,
// timeFormat }: vault-relative folders ('' = vault root); relative=true means
// attachments live in `attachments` next to the note; templates / dailyTemplate
// are null when there are none (dailyTemplate is a note path with .md).
export function vaultLayout(obsidian, exists) {
  return { daily: dailyFolder(obsidian, exists), ...attachmentFolder(obsidian, exists), ...templateSettings(obsidian, exists) };
}

function templateSettings(obsidian, exists) {
  const t = obsidian && obsidian.templates && typeof obsidian.templates === 'object' ? obsidian.templates : {};
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  let templates = str(t.folder) ? normalizeRel(str(t.folder)) : null;
  if (!templates && exists('Templates')) templates = 'Templates';
  const dn = obsidian && obsidian.dailyNotes;
  let dailyTemplate = dn && str(dn.template) ? normalizeRel(str(dn.template)) : null;
  if (dailyTemplate && !/\.md$/i.test(dailyTemplate)) dailyTemplate += '.md';
  return { templates: templates || null, dailyTemplate: dailyTemplate || null, dateFormat: str(t.dateFormat) || 'YYYY-MM-DD', timeFormat: str(t.timeFormat) || 'HH:mm' };
}

function dailyFolder(obsidian, exists) {
  const cfg = obsidian && obsidian.dailyNotes;
  if (cfg && typeof cfg === 'object') {
    const format = typeof cfg.format === 'string' ? cfg.format.trim() : '';
    const folder = normalizeRel(typeof cfg.folder === 'string' ? cfg.folder : '');
    if ((format === '' || format === 'YYYY-MM-DD') && folder !== null) return folder;
  }
  return exists(LEGACY_DAILY) ? LEGACY_DAILY : DEFAULT_DAILY;
}

function attachmentFolder(obsidian, exists) {
  if (obsidian) {
    const raw = obsidian.app && typeof obsidian.app.attachmentFolderPath === 'string'
      ? obsidian.app.attachmentFolderPath.trim() : '/';
    if (raw === './' || raw.startsWith('./')) {
      const sub = normalizeRel(raw.slice(2));
      if (sub !== null) return { attachments: sub, relative: true };
    } else {
      const folder = normalizeRel(raw);
      if (folder !== null) return { attachments: folder, relative: false };
    }
  }
  return { attachments: exists(LEGACY_ATTACHMENTS) ? LEGACY_ATTACHMENTS : DEFAULT_ATTACHMENTS, relative: false };
}

// The vault-relative folder new attachments of a note in `noteDir` go to.
export function attachmentsDirFor(layout, noteDir) {
  if (!layout.relative) return layout.attachments;
  return [noteDir, layout.attachments].filter(Boolean).join('/');
}

// The folder Mufka hides from the note tree: a fixed top-level attachments
// folder (it holds files, not notes). Nothing when attachments sit next to notes
// or at the vault root.
export function hiddenAttachmentsFolder(layout) {
  return !layout.relative && layout.attachments && !layout.attachments.includes('/') ? layout.attachments : null;
}
