# AGENTS.md

Notes for anyone, human or AI, working on Majlis Noor.

## What this app is

Majlis Noor (`مجلس نور`) recreates a Quran halaqa in a mosque: one to four
members sit in a circle and take turns reading the Madani Mushaf, page by
page. A member is a person in the room, who reads aloud, or a recorded
reciter (a sheikh), whose recitation of his pages plays on his turn. It is a
static web app. There is no server, no database, no accounts and no
analytics; everything a reader does stays in their browser.

There are two screens and no router:

- **The start screen** (`SetupScreen`). Where to start (surah, juz or page);
  who sits in the circle and in what order, people and reciters, each moved
  up or down with a button; continue or repeat; pages per turn; manual or
  reciter-timed turns. A halaqa left open is offered first, as one card.
  On a first visit the circle is «أنت» alone; whatever is chosen here is
  saved as it is chosen (the `draft` action), so the next visit finds the
  circle as it was left, started or not.
- **The reading screen** (`ReadingScreen`). The Mushaf page, fitted whole to
  the screen, or the circle (which is also the reading order: every seat
  says what it does next), one button in the top bar switching between
  them, and under both one primary button. On a person's turn it passes the
  turn on; on a reciter's turn it pauses and resumes his recitation.

The brief the app was built from asks for this order of importance on every
screen, and every decision should protect it: **1. the Quran, 2. the current
reader, 3. the next reader, 4. progress, 5. everything else.** When unsure
whether to add an element, leave it out. No points, streaks, badges, charts
or statistics: the only number about the sitting is how many pages were read.

The interface is Arabic only and right to left. Code, comments and these
documents are in English.

Where the app is going, and in what order, is in
[docs/ROADMAP.md](docs/ROADMAP.md). Read it before starting anything large,
and tick its item in the same pull request that finishes it.

## Commands

```sh
npm install
npm run dev        # local server
npm test           # vitest, no watch
npm run lint       # oxlint over src and scripts (type-aware)
npm run format     # oxfmt
npm run build      # tsc, then vite build
npm run preview    # serve the built app
```

Run `npm test`, `npm run lint`, `npx oxfmt --check` and `npm run build`
before you commit. All four must pass; the GitHub Pages workflow runs the same
four and deploys `main`.

Three commands regenerate something committed. You will rarely need them;
each script's header says what it does and why.

```sh
npm run build:mushaf     # src/data/pages/*.json and src/data/mushaf.json
npm run build:timings    # src/data/timings/*.json (after build:mushaf)
node scripts/make-assets.ts   # icons and share card, in headless Chrome
```

Both data scripts cache every API response under `.cache/` (ignored by git)
and take `--offline` to rebuild from that cache alone.

One command checks something only the network can tell: that the audio
host serves every surah file of every reciter. Run it after
`build:timings`, and first whenever a recitation will not play.

```sh
npm run check:audio      # one byte of each of the 1,140 surah files
```

## Where things are

```
src/
  App.tsx             the shell: which screen, the theme, the photos setting
  screens/            the two screens: SetupScreen and ReadingScreen
  components/         their parts: the circle, the forms, sheets, avatars
  data/               the Mushaf index and pages, reciters, timings, Arabic
  halaqa/             the halaqa itself: who reads what (see its AGENTS.md)
  mushaf/             drawing a Mushaf page (see its AGENTS.md)
  hooks/              small browser hooks: the screen wake lock
  styles/             tokens, base, and one stylesheet per area
scripts/              offline tools that build the committed data
public/               icons, share card, manifest, service worker, photos
docs/CONTRIBUTING.md  the walk-through for a first change
docs/ROADMAP.md       the revamp: what comes next, in order, and why
LICENSE               0BSD: everything written here, no conditions
NOTICE                what is only redistributed, and on whose terms
```

`src/halaqa` and `src/data` are plain functions apart from the files named
`use*.ts`, so they are tested without a browser. Keep it that way.

## Rules you must not break

**Never alter the Quran.** The pages in `src/data/pages/` are generated and
the glyph codes and text in them are the Mushaf. Do not hand-edit them, do not
"fix" a word, and do not reflow a page. `src/data/mushaf.test.ts` checks that
all 6,236 ayat are present once each and in order, that every page has 15
lines (8 on pages 1 and 2), that every surah has its header and basmala, and
that the fifteen prostrations are marked. If it fails, you broke something.

**The page is a page.** The Mushaf is never set as flowing text. Each page is
drawn on its own lines in its own font, every line justified edge to edge as
the print is; see `src/mushaf/AGENTS.md`.

**Do not send user data anywhere.** The halaqa (names, page, settings) lives
in `localStorage` under one key and nowhere else.

**The storage key is a contract.** It is `majlis-noor:v1`, read by
`src/halaqa/storage.ts` and again by the inline script in `index.html` that
paints the theme before the bundle loads. Renaming it strands every halaqa
saved under it, unless both read the old key when the new one is empty.
Whatever is read back goes through `sanitizeState()`, which never trusts it
and turns the old shape (`readers`, a list of names) into members.

**Nothing may assume the site's path.** GitHub Pages serves the app under
`/majlis-noor/`. `vite.config.ts` takes `base` from `VITE_BASE_PATH`, which the
workflow takes from `actions/configure-pages`. So:

- In `index.html`, every path goes through `%BASE_URL%`. A hand-written
  `/favicon.svg` looks for the file at the domain root.
- In `public/manifest.webmanifest`, every path is relative (`"."`,
  `"icon-192.png"`): Vite copies that file without reading it.
- In code, public files are reached through `import.meta.env.BASE_URL`, as the
  reciter photos and the service worker are.
- The share card is the one absolute address: `%SHARE_CARD%` in `index.html`,
  filled from `VITE_SITE_URL`. A link scraper will not resolve a relative one.
- Never write the repository's name into code, a script or a test.

**Third-party material goes in NOTICE in the same pass.** Everything written
here is 0BSD, so do not add licence headers or credit lines. The Mushaf data,
the timings and the photographs are the opposite case; NOTICE says what each
is and on what terms. A new photo, font, dataset or audio source gets its entry
when it arrives. The photo of `dosari.webp` is CC BY-SA 4.0, and so is any
crop of it.

## Data

Built once by scripts, committed, never fetched from an API at run time.

- **Mushaf pages** (`scripts/build-mushaf.ts`): the Quran.com API's word-level
  data for the King Fahd Complex Madani Mushaf of 1421H, the layout whose page
  fonts Quran.com serves as "v2". The API's `page_number` and `line_number`
  are that layout; `v1_page` is the older print and disagrees on 361 words, so
  never mix them. `by_page` pages by the older print, which is why words are
  gathered from every response and placed by their own page number.
  - The API leaves out the lines that hold a surah header or a basmala. The
    script infers them: a run of empty lines belongs to the surah that starts
    right after it, header then basmala (only a header for al-Fatihah and
    at-Tawbah). The run can end one page and the surah start the next, as on
    page 341. The script throws if any page comes out wrong.
  - Prostrations are read from the ۩ in the ayah's text, not from the API's
    `sajdah_number`, which leaves out al-Hajj 77. The print marks fifteen.
  - The Madani Mushaf ends every page on a whole ayah. Code relies on that
    (timings never cut an ayah) and the tests check it.
- **Timings** (`scripts/build-timings.ts`): per-ayah timestamps of whole-surah
  recordings, from Quran.com's `qdc` audio API. For each reciter and page, the
  stretch (or two stretches, where a page holds two surahs) of the surah file
  that covers it. One table serves three things: reciter-timed turns
  (summed into a duration), «استمع» (one page played), and a seated
  reciter's turn (all its pages played in a row, `recitationOf()`). All
  playback goes through `src/halaqa/player.ts`; see `src/halaqa/AGENTS.md`.
  - Each timings file keeps one address for all 114 surah files, with the
    surah as a placeholder (`src/data/audio.ts`). Quran.com names most
    reciters' files by the bare number (`68.mp3`) and some by three digits
    (`068.mp3`: al-Shuraim, al-Dosari), so the placeholder is `{n}` or
    `{nnn}`. Never guess an address: copy what the API gives, which may
    look odd (al-Dosari's has a double slash, and the host serves it).
- **Page fonts** are fetched at run time from `static.qurancdn.com`, which
  answers with `access-control-allow-origin: *` and a year-long cache. They
  are not in the repository. See `src/mushaf/fonts.ts`.
- **Reciters** are listed in `src/data/reciters.ts`, ordered from the most
  deliberate to the swiftest by `secondsPerPage`, his average page, which
  the list shows and bands (`paceLabel()`: متأنٍّ جدًّا، متأنٍّ، معتدل، سريع).
  Adding one: add the entry with its Quran.com `qdc` id, run
  `npm run build:timings` and `npm run check:audio`, set `secondsPerPage`
  to what the test reports, and add a photo only if a freely licensed one
  exists (and its NOTICE entry); otherwise the avatar shows his initial.
  `timings.test.ts` checks every page of every reciter, his
  `secondsPerPage` against his file, and the order.

## Style

- Copy shown to the user is Arabic. Names in code are English.
- Comments say **why**, not what. If a line looks odd, explain the reason.
- Numbers shown to the user use Arabic-Indic digits through `arabic()` in
  `src/data/arabic.ts`, and counted nouns go through `counted()` and its
  helpers (`pagesCount`, …), never `${n} صفحات` by hand: the noun after a
  number changes with the number (صفحتان، ٣ صفحات، ١١ صفحة).
- A field that takes a number is never `type="number"`: it throws away ٢٤,
  which is what an Arabic keyboard types. Use `type="text"` with
  `inputMode="numeric"` and read it back through `digits()`.
- Do not add a dependency unless there is no reasonable way around it. The app
  ships React, Base UI's dialog and lucide icons, and nothing else.
- The linter runs the React Compiler rules. It rejects impure calls during
  render (`Date.now()`), reading refs during render, and `setState` straight
  from an effect body. Restructure instead of silencing it.

## Accessibility

- Every touch target is at least 44 by 44 pixels, with one exception WCAG
  2.5.8 allows: links inside a sentence (the about text). Every control has an
  accessible name; `app.test.tsx` fails on any button, input, select or link
  without one, on both screens.
- The member list says every change aloud (added, moved to seat 2 of 4,
  taken out) in its own `<output>`, and keeps focus where the hand is: on
  the moved member's button, in the new reader's name field, on the next
  row after a removal. Moving is two buttons, never a drag, so it works
  with one finger, a switch or a keyboard (WCAG 2.5.7).
- Choices are native radio inputs styled as buttons (`Choice.tsx`), so arrow
  keys and screen readers work with nothing added. Keep new choices on it.
- Text meets WCAG AA in all four themes. The table at the head of
  `src/styles/tokens.css` is enforced by `src/styles/contrast.test.ts`, which
  recomputes it from the colours actually declared. Do not fade text with
  `opacity`; use `--muted`, which is chosen to pass.
- Each Mushaf line carries its Uthmani text, hidden from sight, for screen
  readers: the glyphs are private-use code points that mean nothing to them.
- Whose turn it is lives in an `<output>` that a screen reader announces when
  the turn moves.
- `prefers-reduced-motion` stills every transition and animation.
- The reciter list is buttons that say whether they are chosen
  (`aria-pressed`), not radios: arrowing through a radio group selects as it
  goes, and choosing closes the list.

## Settings that belong to the device

`prefs` in `state.ts`, kept apart from the halaqa (`config`) because they
are how this device looks and sounds, not how the circle reads: the theme,
the reciters' photos, the speed of recitations (0.75, 1 or 1.25; beyond
them tajweed suffers, so there is no slider), how many times «استمع» recites
the page, and a soft tone (`src/halaqa/chime.ts`, Web Audio, never on the
recitations' element) when a turn passes on its own. They are in the
settings and behind the gear on the start screen. One more is chosen
where it is used: the design of the picture saved at the close of a
sitting (`cardDesign`: the framed 4:5 `ornate`, the default; the 9:16
`status`, kept inside the band a status or a story leaves clear; the
square `simple`), picked over «احفظ صورة» and kept for the next sitting.
All three are laid out by `src/sitting/cardImage.ts` from the same words
(`cardText.ts`). The halaqa's own
«مهلة الدور» (a timed reader's turn ×1, ×1.25 or ×1.5 of the reciter's
time) is in `config`, since it is the circle's choice.

## Photos

Reciters' photographs follow `prefs.photos`: shown, blurred, or hidden. Some
readers would rather not look at faces, or not in a sitting with others.
The choice is behind the gear on the start screen, before the first photo
appears, and in the settings. Every face goes through `ReciterFace`
(`ReciterAvatar.tsx`), which reads the choice from `PhotosContext`; a hidden
photo is not rendered, so it is never fetched, and the lock screen gets no
artwork unless photos are shown. Draw a reciter's face anywhere else and it
must go through `ReciterFace` too.

## Keyboard

Keys live in one effect in `src/screens/ReadingScreen.tsx`.

| Key     | What it does                                                    |
| ------- | --------------------------------------------------------------- |
| `←`     | forward: next page in the turn, «تمّ», or skip a reciter's turn |
| `→`     | back: previous page in the turn, or the previous member         |
| `Space` | pause or resume whatever runs: a reciter's turn, a timed turn (and «استمع» with it), or «استمع» |

Left is forward because a right-to-left book turns that way. Arrows are used
rather than letters because a single-letter shortcut must be remappable to
pass WCAG 2.1.4, and arrows are exempt. A focused button owns Space and Enter,
a field owns every key, and an open sheet owns the keyboard, so the handler
steps aside for all three. If you add a key, add it to the handler, the
`aria-keyshortcuts` of its button, the list in `SettingsPanel.tsx`, and the
README.

## Layout

The reading screen is the same on every screen (`src/styles/reading.css`):
one column the height of the window, never scrolled. A top bar says whose
turn it is and opens the jump; a button in it switches the main area
between the Mushaf page and the circle (`showing` in `ReadingScreen`); the
action bar stays under both. There is no reading-order list: the circle is
the order, every seat saying what it does next.

The page fits its room whole. The room (`.mushaf-stage`) is a size
container, and the page is `min(100cqw, 100cqh / --page-height)` wide, so
it is as large as the room allows in both directions with no breakpoint
deciding it. Only where that would make it narrower than 220px (a phone on
its side) does it keep 220px and the room scroll. Under 700px of height the
row of page arrows gives its room to the page. The circle's room is a size
container too, and the circle and its seats, names and marks are measured
in it, so it grows from a phone to a wall.

Everything inside the page is in `cqi`, so the page is a fixed shape,
`--page-height` times its width, declared in `tokens.css` and itemised in
`mushaf.css`. Change anything inside the page and you must update
`--page-height`, or it will overflow or float in its frame.

The action bar is a size container. Below 560px of its own width (a phone)
the secondary actions drop their visible words and keep them as accessible
names, so the main button keeps its own. Under 400px of viewport the main
button says «تمّ — التالي» instead of «تمّ — القارئ التالي», the reciter's
button drops his photo, and the top line, when it carries a clock, says
«ص ٢٤» for «الصفحة ٢٤».

Measured in Chrome at 320×568, 360×640, 375×667, 390×844, 820×1180,
1100×700, 1440×900 and 2560×1440, on both sides of the switch, in a timed
reader's turn and a reciter's: the page whole with nothing scrolled, no
horizontal overflow, no seat off the screen, and the main button never
under 140px with its words whole. If you add anything to the bar or the top
line, measure again.

## Themes

Four, in `src/styles/tokens.css`: green (the default), burgundy and blue are the carpet at
night; sand is the courtyard by day, a light theme in which the gold deepens
to bronze so it still passes as text. A theme sets colours and nothing else.
Stylesheets never write a colour of their own: translucent tints come from
`--well`, `--hover`, `--page-shadow`, or channels such as
`rgb(var(--shadow-rgb) / 0.3)` and `rgb(var(--glow-rgb) / 0.45)`, so a new
rule looks right in all four. Adding a theme means its block in
`tokens.css`, its entry in `contrast.test.ts`, its colour in `App.tsx`
(`THEME_COLOR`) and in `index.html` (twice), and its swatch in `sheet.css`.

## Offline

`public/sw.js` is a hand-written service worker, registered only in
production: the page network-first, hashed assets and page fonts cache-first,
recitations never cached. Bump its `VERSION` to drop every cache it made.
