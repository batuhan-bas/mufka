<div align="center">

<img src="build/icon.png" width="96" alt="Mufka icon">

# Mufka

**Your week and your notes, in one calm Mac app.**

A week planner with times, repeating plans and your Outlook, Teams and Google
calendars, and an Obsidian‑like Markdown notes vault with links, backlinks and
a graph — local and private.

**[mufka.app](https://mufka.app)** · [Download](https://github.com/batuhan-bas/mufka/releases/latest) · [Privacy](https://mufka.app/privacy)

![The Planner: the week with to-dos on top, an hour grid below and calendar meetings in their colour](docs/screenshots/planner.png)

</div>

---

## Contents

- [What Mufka does](#what-mufka-does)
- [Install it on a Mac](#install-it-on-a-mac)
- [Your notes and your data](#your-notes-and-your-data)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [For the developer](#for-the-developer)
- [License](#license)

## What Mufka does

Mufka has two modes, switched at the top left (**Notes | Planner**, or ⌃Tab).

### Planner — the week at a glance

- **Monday to Sunday** in columns: to-dos on top, an **hour grid** below, a red
  line for "now".
- **New plan** asks for everything at once: title, day, start and end time,
  and **Repeat** — every day, weekdays, every week, chosen days, or monthly.
- **Repeating plans** look different (teal, dashed edge, ↻ and their rule), so
  "this happens every Tuesday" is visible at a glance.
- **Missed** plans — not done after their time — get a coral edge and a
  one-click **→ Today**. Nothing moves on its own.
- **Your calendars in the week:** connect **Microsoft (Outlook, Teams)** and
  **Google Calendar** in **Settings** (⌘,) and your meetings appear next to
  your plans, in each calendar's colour; all-day events sit on top. Click one
  for when, where and who, and **Join meeting** for Teams, Meet or Zoom links.
  Read-only: Mufka never changes your calendars. Choose which calendars to
  show; ↻ refreshes.
- Move plans by **dragging** (to another day or time; drag the bottom edge to
  change the end), with the ⋯ menu, or with the keyboard (⌥←/→ a day, ⌥↑/↓ 15
  minutes). Every change can be undone with ⌘Z.

<p align="center"><img src="docs/screenshots/calendar-event.png" width="85%" alt="A Teams meeting from the calendar, with Join meeting"></p>

<p align="center"><img src="docs/screenshots/new-plan.png" width="85%" alt="New plan: title, day, time and repeat on chosen days"></p>

### Home — today

Today's date, what you planned for it and today's meetings in time order
(tick plans off here, **Join** a meeting), and the day's note. Nothing planned
yet? Home offers to open the Planner.

<p align="center"><img src="docs/screenshots/home.png" width="85%" alt="Home: today's plans and meetings, and the daily note"></p>

### Notes — an Obsidian-like vault

- **Plain Markdown files** in folders — use Mufka's own folder or open any
  folder, such as an existing **Obsidian vault** (nothing is copied or added).
- **Write in place**: notes always look formatted; click a paragraph to edit it.
  Tables, task lists, callouts, footnotes, frontmatter, `==highlights==`.
- **`[[Links]]`** with autocomplete, **backlinks** under every note, **page
  preview** on hover, `![[embeds]]` of other notes and images.
- **Details** panel: outline, outgoing links, unlinked mentions (one click turns
  a mention into a link) and all tags.
- **Templates** (Obsidian-compatible), **bookmarks**, drag-and-drop **images**
  and files, export to **PDF** or Markdown, sorting by name or last edit.
- **Meeting notes from [Wispr Flow](https://wisprflow.ai)**: connect your
  Wispr account in **Settings** (⌘,) and every meeting its Notetaker records —
  Zoom, Google Meet, Teams, Slack huddles or in person — arrives in a
  **Meetings** folder as a note: summary, tasks, your notes and the transcript.
  Read-only; it checks every 15 minutes. Wispr Flow's dictation also types
  straight into any note.

<p align="center"><img src="docs/screenshots/note.png" width="85%" alt="A note with the Details panel showing its links"></p>

### Graph, search and commands

- **Graph** shows how notes connect; hover to highlight, click to open, or show
  just one note's neighbourhood.
- **Search** at the top of the sidebar finds notes and plans (and creates a note
  when nothing matches). **⌘O** jumps to any note, **⌘P** runs any command,
  **⌘/** lists every shortcut.

<p align="center"><img src="docs/screenshots/graph.png" width="85%" alt="The graph of notes and links"></p>

## Install it on a Mac

**Needs:** macOS 12 Monterey or later, Apple silicon or Intel.

1. Download **`Mufka-<version>-universal.dmg`** from the
   [Releases](https://github.com/batuhan-bas/mufka/releases) page (or build it
   yourself, see [For the developer](#for-the-developer)).
2. Open it and drag **Mufka** onto **Applications**.
3. Open **Mufka** from Applications. The first time, macOS says it cannot check
   the app for malicious software — Mufka is not distributed through the App
   Store. To allow it once:
   - open **System Settings → Privacy & Security**, scroll down to the message
     about Mufka and click **Open Anyway**, then confirm; or
   - on macOS 14 and earlier you can also **right-click Mufka → Open → Open**.
4. When Mufka asks to send notifications, click **Allow** — that is how plan
   reminders reach you. (If you skip it, reminders appear inside the window.)

That's it: Mufka opens on **Home**. Updates are installed the same way —
replace the app in Applications; your notes and plans stay.

> **If macOS still refuses to open it**, Terminal can clear the "downloaded
> from the internet" flag:
> `xattr -dr com.apple.quarantine /Applications/Mufka.app`

### Uninstall

Drag Mufka from Applications to the Trash. Your notes and plans stay in
`~/Library/Application Support/Mufka` (or in the notes folder you chose) until
you delete them.

## Your notes and your data

Everything stays on your Mac; there is no account and no server. The exceptions
are the connections you turn on yourself in **Settings**: your **Microsoft**
and **Google** calendars (Mufka reads your events; it asks only for calendar
read access) and **Wispr Flow** (Mufka reads your meetings). Mufka never sends
your notes or plans anywhere. Sign-ins are kept encrypted in your Keychain;
**Disconnect** forgets them. Details: the [privacy policy](https://mufka.app/privacy).

<p align="center"><img src="docs/screenshots/settings.png" width="70%" alt="Settings: the Microsoft and Google calendars and Wispr Flow"></p>

| What | Where |
|---|---|
| Notes | `~/Library/Application Support/Mufka/Notes` — or any folder you open with **Notes folder** at the bottom of the sidebar (for example your Obsidian vault). Plain `.md` files. |
| Plans | `~/Library/Application Support/Mufka/planlar.json` |
| Backups | **File → Export Plans…** writes a JSON copy; notes are ordinary files, so any backup tool (Time Machine, iCloud Drive, git) works. |

## Keyboard shortcuts

| Shortcut | Does |
|---|---|
| ⌘T | Home (today) |
| ⌘1 · ⌃Tab | Planner · switch Notes / Planner |
| ⇧⌘P | New plan |
| ⌥⌘← / ⌥⌘→ | Previous / next week |
| ⌘N | New note |
| ⌘O · ⌘P | Open a note · command palette |
| ⌘F | Search |
| ⌘G · ⇧⌘G | Graph · local graph |
| ⌘E | Edit a note's raw Markdown |
| ⌘, | Settings (calendar and Wispr Flow connections) |
| ⇧⌘T | Insert a template |
| ⌘[ · ⌘] | Back · forward |
| ⌘\\ · ⇧⌘\\ | Sidebar · Details panel |
| ⌘Z · ⇧⌘Z | Undo · redo |
| ⌘/ | All shortcuts |

---

## For the developer

Electron + plain JavaScript (no UI framework), built with
[electron-vite](https://electron-vite.org). All pure logic lives in `lib/*.mjs`
and is shared verbatim by the app and the tests.

```sh
npm install              # dependencies, then downloads Electron (pnpm works too)
npm run dev              # develop with hot reload
npm start                # build, then run the built app
npm test                 # unit tests, then build + the real end-to-end test
npm run dist             # build the signed universal .dmg into dist/
npm run dist:public      # the same, ad-hoc signed: for sharing / Releases
npm run sign:dev         # sign the dev Electron so notifications work in npm start
```

### Building the app

```sh
npm run dist
```

This writes **`dist/Mufka-1.0.0-universal.dmg`** (one app for Apple silicon and
Intel). The app is signed with the first Developer ID or Apple Development
identity in your keychain (`MUFKA_SIGN_IDENTITY` overrides it; without one it
is ad-hoc signed), which is what lets macOS show notifications. It is **not
notarized**, so the person installing it needs the one-time **Open Anyway**
step above. Notarizing needs a paid Apple Developer account; with one, add
`notarize` to the `mac` build settings and the warning goes away.

For a copy you share or upload to Releases, use **`npm run dist:public`**: it
signs ad-hoc, so no certificate (and the name and email in it) ends up inside
the app. macOS may then ask for notification permission again after each
update.

**Google Calendar** needs an OAuth client of type *Desktop app* (Google Cloud
Console → Google Auth Platform → Clients). Its id and secret are not in this
repository; put them in a git-ignored `.env.local` before building:

```sh
MAIN_VITE_GOOGLE_CLIENT_ID=….apps.googleusercontent.com
MAIN_VITE_GOOGLE_CLIENT_SECRET=…
```

Without it, Settings shows Google as "not set up"; everything else works.
Microsoft uses Mufka's public app registration (`lib/calendar.mjs`).

Bump `version` in `package.json` before building a new copy, so people can
tell versions apart.

### Tests

UI behaviour is proven by a real end-to-end test (`test/e2e.js`): it boots the
built app with a throwaway data folder, drives it only through real input
events (clicks, keys, drags, OS file drops) and checks the files on disk. Pure
logic has `node:test` suites next to each `lib/` module.

### Project notes

The name **Mufka** and the app id are fixed: changing `productName` would
move the data folder.

## Contributing

Issues and pull requests are welcome. Run `npm test` (unit tests and the
end-to-end test) before opening a pull request.

## License

[MIT](LICENSE) © 2026 Batuhan Baş.

Mufka includes open-source components under their own licenses (Electron,
mdast/micromark, Lucide icons); see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
