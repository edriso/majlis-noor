# AGENTS.md

Notes for anyone working on Majlis Noor.

## What this app is

Majlis Noor (`مجلس نور`) recreates a Quran halaqa in a mosque: up to eight
members sit in a circle and take turns reading the Madani Mushaf, by the
page, the ayah, the hizb quarter or the surah. A member is a person in the
room, who reads aloud, or a recorded reciter (a sheikh), whose recitation of
his turn plays on his turn. The circle gathers round one device, and is of
every age. It is a static web app. There is no server, no database, no
accounts and no analytics; everything a reader does stays in their browser.

Two words, used the same way everywhere: «المجلس» is the sitting («ابدأ
المجلس»، «إنهاء المجلس»), «الحلقة» the people in it («أهل الحلقة»، «عدّل
الحلقة»). One reading alone is spoken to as one («قرأتَ», «تابع»).

There are two screens and no router:

- **The start screen** (`SetupScreen`). A sitting left open is offered
  first, as one card («متابعة», or «ابدأ مجلسًا جديدًا»). Then three things,
  each with a default, so «ابدأ المجلس» works on arrival: «من أين نبدأ؟», a
  row opening the place picker (surah, juz or page); «أهل الحلقة», the
  members in order, people and sheikhs, each moved up or down with a
  button; and «طريقة الحلقة», a row showing what is chosen («كلٌّ يُكمل ·
  صفحة · بضغطة «تمّ»») and opening the circle's sheet (`CircleOptions`): the
  teaching circle in one press («حلقة تلقين»), continue or repeat, the unit
  and size of a turn, manual or timed by a sheikh, a goal, who starts each
  page, from memory. «ابدأ المجلس» stays at the foot of the screen. On a
  first visit the circle is «أنت» alone; every choice is saved as it is
  made (`draft`). The gear opens appearance and sound.
- **The reading screen** (`ReadingScreen`). A top bar, the turn strip: who
  reads now, large, and who after; then the place chip («ص ٥٠», which opens
  the jump), the switch between the page and the circle, and the menu.
  Under it the Mushaf (one page fitted whole, or two facing pages where the
  room is wide), or the circle, which is also the reading order. Under both,
  the action bar: one primary button, a thin line of the sitting's
  progress, and a few quiet buttons. On a person's turn the button passes
  the turn on; on a reciter's it pauses and resumes him. A tap on an ayah
  opens the ayah bar. «إنهاء المجلس» (in the menu, and on the goal's and the
  khatm's cards) opens the close card, «ختام المجلس».

The brief the app was built from asks for this order of importance on every
screen, and every decision should protect it: **1. the Quran, 2. the current
reader, 3. the next reader, 4. progress, 5. everything else.** When unsure
whether to add an element, leave it out. No points, streaks, badges, charts
or statistics: the only numbers about a sitting are how much it read and,
on its close, how long it sat.

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
npm run format     # oxfmt (Markdown is left alone)
npm run build      # tsc, then vite build
npm run preview    # serve the built app
```

Run `npm test`, `npm run lint`, `npx oxfmt --check` and `npm run build`
before you commit. All four must pass; the GitHub Pages workflow runs the same
four and deploys `main`.

One command measures the layout in a real browser. Run it before and after
any change to the reading screen's layout (see _Layout_):

```sh
node scripts/check-layout.ts                 # build, then measure
node scripts/check-layout.ts --no-build      # measure the last build
node scripts/check-layout.ts --shots [dir]   # and keep a screenshot of each
```

Three commands regenerate something committed. You will rarely need them;
each script's header says what it does and why.

```sh
npm run build:mushaf     # public/pages/*.json and src/data/mushaf.json
npm run build:timings    # src/data/timings/*.json and public/words/ (after build:mushaf)
node scripts/make-assets.ts   # icons and share card, in headless Chrome
```

Both data scripts cache every API response under `.cache/` (ignored by git)
and take `--offline` to rebuild from that cache alone; `build:timings` also
caches each surah file's HEAD answer and measured length under
`.cache/quranicaudio/`. `build:mushaf` writes the index compact: run
`npm run format` after it.

One command checks something only the network can tell: that the audio host
still serves every surah file of every reciter, at the length, date and
duration the timings recorded. Run it after `build:timings`, and first
whenever a recitation will not play. `.github/workflows/audio.yml` runs it
every Monday.

```sh
npm run check:audio      # the first 16 KB of each of the 1,140 surah files
```

## Where things are

```
src/
  App.tsx               the shell: which screen, the theme, focus on a screen change
  screens/              SetupScreen and ReadingScreen
    reading/            the reading screen's parts: useTurn (the turn as shown),
                        useReadingKeys, useMarks, useQuiet, spread.ts, TopBar,
                        TurnStrip, MushafView, CircleView, TurnActions,
                        Completion, JumpSheet, ListenerSheet
  components/           shared parts: the circle, the forms, Sheet, Choice,
                        Switch, SummaryRow, PlacePicker, CloseCard, faces and
                        names.ts (initials, tints), icons.tsx
  sitting/              the close of a sitting: cardText (its words), cardImage
                        (the picture), saveImage (share or download)
  halaqa/               who reads what, and the sound (see its AGENTS.md)
  mushaf/               drawing a page: MushafPage, words.ts, useFollow,
                        AyahBar, MemoryCover (see its AGENTS.md)
  data/                 the Mushaf index, reciters, timings, audio.ts, Arabic
  hooks/                the screen wake lock, the service worker's registration
  styles/               tokens, themes.ts, and one stylesheet per part
  app.test.tsx          both screens through the App, names and keys included
  close.test.tsx        the close of a sitting, from the menu, the goal, the khatm
  sw.test.ts            the service worker, in a VM with fake caches
  test-setup.ts         jsdom's gaps: matchMedia, <dialog>, media, page fetches
scripts/                build the committed data, measure the layout, check the
                        audio host; precache.ts is called by the build
public/
  pages/                the 604 Mushaf pages, one JSON file each
  words/                each reciter's word timings, one file per surah
  fonts/                the interface fonts and their licences
  reciters/             the reciters' photos
  sw.js                 the service worker
                        and icons, share card, manifest
docs/CONTRIBUTING.md    the walk-through for a first change
docs/ROADMAP.md         the revamp: what was done, what is left, and why
LICENSE                 0BSD: everything written here, no conditions
NOTICE                  what is only redistributed, and on whose terms
```

`src/halaqa`, `src/data` and `src/sitting` are plain functions apart from
the files named `use*.ts` (and `cardImage`'s drawing), so they are tested
without a browser. Keep it that way.

## Rules you must not break

**Never alter the Quran.** The pages in `public/pages/` are generated and
the glyph codes and text in them are the Mushaf. Do not hand-edit them, do not
"fix" a word, and do not reflow a page. `src/data/mushaf.test.ts` pins a
digest of every page file, and checks that all 6,236 ayat are present once
each and in order, each ending in its marker; that every page's glyphs run
in reading order; that every page has 15 lines (8 on pages 1 and 2) and ends
on a whole ayah; that every surah has its header and basmala; that the
fifteen prostrations are marked; and that the index (with its 199 ۞) agrees
with the pages. If it fails, you broke something.

**The page is a page.** The Mushaf is never set as flowing text. Each page is
drawn on its own lines in its own font, every line justified edge to edge as
the print is; see `src/mushaf/AGENTS.md`.

**Do not send user data anywhere.** The halaqa (names, place, settings)
lives in `localStorage` under one key and nowhere else. The close card is
made on the device and goes only where the reader sends it.

**The storage key is a contract.** It is `majlis-noor:v1`, read by
`src/halaqa/storage.ts` and again by the inline script in `index.html` that
paints the theme before the bundle loads (`bootScript()` in
`src/styles/themes.ts`; `themes.test.ts` holds the two to the same key).
Renaming it strands every halaqa saved under it, unless both read the old
key when the new one is empty. Whatever is read back goes through
`sanitizeState()`, which never trusts it.

**Nothing may assume the site's path.** GitHub Pages serves the app under
`/majlis-noor/`. `vite.config.ts` takes `base` from `VITE_BASE_PATH`, which the
workflow takes from `actions/configure-pages`. So:

- In `index.html`, every path goes through `%BASE_URL%`. A hand-written
  `/favicon.svg` looks for the file at the domain root.
- In `public/manifest.webmanifest`, every path is relative (`"."`,
  `"icon-192.png"`): Vite copies that file without reading it.
- In code, public files are reached through `import.meta.env.BASE_URL`, as the
  pages, the word timings, the reciter photos and the service worker are.
- In CSS, a public file is reached by its root path (`url('/fonts/…')`), and
  Vite adds the base.
- The share card is the one absolute address: `%SHARE_CARD%` in `index.html`,
  filled from `VITE_SITE_URL`. A link scraper will not resolve a relative one.
- Never write the repository's name into code, a script or a test. The about
  text's links take the address from `VITE_REPO_URL`, and without it are not
  drawn; `SettingsPanel.test.tsx` fails on a GitHub address in `src`.

**Third-party material goes in NOTICE in the same pass.** Everything written
here is 0BSD, so do not add licence headers or credit lines. The Mushaf data,
the timings, the fonts, the icons and the photographs are the opposite case;
NOTICE says what each is and on what terms. A new photo, font, dataset or
audio source gets its entry when it arrives (`fonts.test.ts` fails on a font
folder NOTICE does not name). The photo of `dosari.webp` is CC BY-SA 4.0,
and so is any crop of it.

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
  - A page font numbers its glyphs in reading order, so the script checks
    every page's glyphs run in that order. That is how it found the one mark
    the API misplaces: 84:21's end-of-ayah mark, which it sets on line 13 of
    page 589 and the print sets after «يَسْجُدُونَ ۩» on line 14. A mark set
    before its ayah's last word moves to that word's line.
  - Prostrations are read from the ۩ in the ayah's text, not from the API's
    `sajdah_number`, which leaves out al-Hajj 77. The print marks fifteen.
  - Six surah names are spelt as a modern list spells them, not as the API
    gives them: إبراهيم، سبأ، الإنسان، النبأ، الانفطار، الانشقاق. Only the
    names; the Mushaf's text is never touched.
  - The Madani Mushaf ends every page on a whole ayah. Code relies on that
    (a turn of pages is whole ayat, timings never cut an ayah) and the tests
    check it.
  - `src/data/mushaf.json` is the index: the 114 surahs, and the first ayah
    of every surah, juz, hizb quarter and page, numbered 1 to 6236 through
    the whole Mushaf. The quarters come from the ۞ in the print (199 of
    them; the other 41 open a surah).
- **Timings** (`scripts/build-timings.ts`): per-ayah and per-word timestamps
  of whole-surah recordings, from Quran.com's `qdc` audio API.
  `src/data/timings/<id>.json` holds, per reciter: the surah files' address
  (`audio`), each file as the host served it (`files`: length,
  last-modified, how long it plays, how long the API says it plays), every
  ayah's start and length (`ayat`), every page's stretch (`pages`), and two
  lists of what not to play (`untimed`, `misplaced`). One table serves
  reciter-timed turns (summed into a duration), «استمع», a seated reciter's
  turn and an ayah heard alone. All playback goes through
  `src/halaqa/player.ts`; see `src/halaqa/AGENTS.md`.
  - **Words.** `public/words/<id>/<surah>.json`, 1,140 files fetched only
    when the page follows a recitation word by word. The API's segments are
    cleaned: malformed entries dropped, times rounded and kept inside their
    ayah, repeats kept in the order heard, no two words overlapping. 37:130
    «إِلْ يَاسِينَ» is one glyph that reciters time as two words, which are
    joined (`RENUMBERED` in `src/data/audio.ts`). An ayah not fully timed is
    listed as `partial`, and marked whole.
  - **Untimed and misplaced.** The host replaces files in place, and some no
    longer fit their timings. A surah is `untimed` when its last ayah ends
    more than 2 seconds after its file does, or its file is not the one the
    API timed and runs on past it (`LEEWAY_MS`, `endMisfit`). In a file that
    fits, an ayah is `misplaced` when it is timed far faster than the reciter
    recites with its own words seconds outside it, with its neighbours
    (`misplacedAyat`). The app never plays either: a turn or «استمع» holding
    one says the recitation is not available, and offers «تخطَّ» or another
    sheikh.
  - Each timings file keeps one address for all 114 surah files, with the
    surah as a placeholder (`src/data/audio.ts`). Quran.com names most
    reciters' files by the bare number (`68.mp3`) and some by three digits
    (`068.mp3`: al-Shuraim, al-Dosari), so the placeholder is `{n}` or
    `{nnn}`. Never guess an address: copy what the API gives, which may
    look odd (al-Dosari's has a double slash, and the host serves it).
    `build-timings.ts` writes the template only if it gives back the API's
    own address for every surah.
- **Page fonts** are fetched at run time from `static.qurancdn.com`, which
  answers with `access-control-allow-origin: *` and a year-long cache. They
  are not in the repository (ROADMAP, D3). See `src/mushaf/fonts.ts`.
- **Interface fonts** are the app's own, in `public/fonts/`, declared in
  `src/styles/fonts.css`: IBM Plex Sans Arabic (three weights, unmodified),
  Reem Kufi and Amiri (subset), and Amiri Quran (whole, since it sets the
  Quran's text when a page font cannot load). NOTICE says where each came
  from. `scripts/make-assets.ts` draws the icons in them too.
- **Reciters** are listed in `src/data/reciters.ts`, ordered from the most
  deliberate to the swiftest by `secondsPerPage`, his average page, which
  the list shows and bands (`paceLabel()`: متأنٍّ جدًّا، متأنٍّ، معتدل، سريع).
  Adding one: add the entry with its Quran.com `qdc` id, run
  `npm run build:timings` and `npm run check:audio`, set `secondsPerPage`
  to what the test reports, add his coverage to `fullyTimed` and his
  `untimed` and `misplaced` lists (the build prints them) to the pinned
  lists in `timings.test.ts`, and add a photo only if a freely licensed one
  exists (and its NOTICE entry); otherwise the avatar shows his initial.
  `timings.test.ts` checks every page and ayah of every reciter, his word
  coverage, his `secondsPerPage` against his file, and the order.

## Style

- Copy shown to the user is Arabic. Names in code are English.
- Comments say **why**, not what. If a line looks odd, explain the reason.
- Numbers shown to the user use Arabic-Indic digits through `arabic()` in
  `src/data/arabic.ts`, and counted nouns go through `counted()` and its
  helpers (`pagesCount`, `ayatCount`, `surahsCount`, `minutesCount`,
  `hoursCount`, `timesCount`, `seatsCount`), never `${n} صفحات` by hand: the
  noun after a number changes with the number (صفحتان، ٣ صفحات، ١١ صفحة).
  A name after a preposition goes through `genitive()` («إلى أبي بكر»), and
  a list of names through `joinNames()` («أحمد وعمر وفاطمة»).
- A field that takes a number is never `type="number"`: it throws away ٢٤,
  which is what an Arabic keyboard types. Use `type="text"` with
  `inputMode="numeric"` and read it back through `digits()`.
- Do not add a dependency unless there is no reasonable way around it, and
  say why here. The app ships React and React DOM and nothing else. The
  dialog is the native `<dialog>` (`Sheet.tsx`); the 23 icons are Lucide's
  drawings copied into `src/components/icons.tsx`, always `aria-hidden`,
  with Lucide's and Feather's licences in NOTICE.
- The linter runs the React Compiler rules. It rejects impure calls during
  render (`Date.now()`), reading refs during render, and `setState` straight
  from an effect body. Restructure instead of silencing it.
- Anything that changes four times a second (a clock, a recitation's
  position) is read through `useSyncExternalStore` in the small component
  that shows it, never held in the reading screen's state, or the Mushaf
  page is drawn four times a second.

## Stylesheets

`src/styles/index.css` imports every stylesheet into a cascade layer:
`reset, tokens, base, components, screens, utilities`. A later layer wins
whatever the selectors' weight, so a screen restyles a component with a
plain class, and `.visually-hidden` beats both. Only the font faces
(`fonts.css`) are outside a layer. Keep the import order: within a layer the
files are read in the order listed, and the minifier drops the `@layer`
statement, so the order of first appearance is the order.

- **components**: `buttons`, `fields`, `choice`, `switch`, `rows`, `faces`,
  `reciters`, `sheet`, `place-picker`, `notice`, `close`.
- **screens**: `setup`, `settings`, `mushaf`, `marks`, `reading`, `topbar`,
  `stage`, `circle`, `completion`, `action-bar`, `menu`.

Under `prefers-reduced-motion`, `reset.css` stills every animation and
transition outright (`none !important`), so a style read after a change
sees the new value at once.

## Tokens and themes

Everything is drawn from tokens in `src/styles/tokens.css`: type in `rem`
(`--text-xs` 14px for metadata only, `--text-sm` 15px the least for a
sentence, up to `--text-2xl`), `--leading-prose` and `--leading-tight`,
`--space-1…7`, `--radius-sm/md/lg/pill`, `--target` (44px) and
`--target-primary` (56px), `--ease` and three durations, and the stacking
order `--z-raised`, `--z-overlay`, `--z-bar`, `--z-top`, `--z-skip`. The
reading screen scales past a laptop with `--screen-*` (`reading.css`):
type, targets, icons and faces grow with the screen's shorter side, in
`rem` so the reader's own text size carries through. Arabic is never
letter-spaced.

Four themes: green (the default), burgundy and blue are the carpet at night;
sand is the courtyard by day, a light theme in which the gold deepens to
bronze so it still passes as text. The page is the same ivory (`--paper`,
`--paper-edge` towards its edges) in all four. A theme sets colours and
nothing else. Stylesheets never write a colour of their own: translucent
tints come from `--well`, `--hover`, `--page-shadow`, or channels such as
`rgb(var(--shadow-rgb) / 0.3)`, so a new rule looks right in all four.
Marks on the page are `--mark-turn` and `--mark-recite`; a control that
cannot act is `--disabled`; a reader's face is tinted `--seat-1…8` (mixed
from `--seat-hue-*`, chosen by member id in `names.ts`'s `tintOf`), so two
whose initials match still differ.

A first visit takes sand on a light system and green on a dark one
(`FIRST_VISIT`, `systemTheme()`); after that the theme is saved like any
choice.

Adding a theme means: its block in `tokens.css`, with its `color-scheme`;
its entry in `src/styles/themes.ts` (`ground` = `--bg`, `gold` = `--gold`,
`scheme`, `swatch`); the `Theme` union and the sanitiser's list in
`src/halaqa/state.ts`; its name in `Preferences.tsx`. `themes.test.ts` fails
if `themes.ts` and `tokens.css` disagree, and `contrast.test.ts` takes the
themes from `themes.ts`. The build writes `index.html`'s copies (the boot
screen's colours, `theme-color`, the boot script) from `themes.ts`.

## Accessibility

- Every touch target is at least 44 by 44 pixels, with two exceptions WCAG
  2.5.8 allows as inline targets: links inside a sentence (the about text),
  and the end-of-ayah markers on the page, which are buttons laid out
  exactly as the glyphs they replace. Every control has an accessible name
  that begins with the words it shows (2.5.3); `app.test.tsx` fails on any
  control without one, or whose name does not begin with its visible words,
  on both screens, wide and phone (the page's glyphs aside). Where a label
  is a numeral, `spokenSuffix` adds words after it, never in its place.
- Text meets WCAG AA in all four themes. The table at the head of
  `tokens.css` is enforced by `src/styles/contrast.test.ts`, which recomputes
  it from the colours declared, `color-mix()` results included. Do not fade
  text or a control with `opacity`; use `--muted`, or `--disabled` for a
  control that cannot act (a disabled primary button becomes an outline; in
  forced colours, `GrayText`).
- When the screen changes, the focus goes to the new screen's heading
  (`[data-screen-title]`, App.tsx), which a screen reader then says. Not on
  arrival: the app does not move a focus nobody has placed.
- Sheets are native modal `<dialog>`s (`Sheet.tsx`): focus on the title,
  back to the opener on close; a panel that changes in place (the circle's
  form, the list of sheikhs) takes the focus to its title, and «رجوع» or a
  choice returns it to the control that stepped forward. Escape, the
  backdrop and «إغلاق» close it. `onClosed` fires once it has gone, so one
  sheet never opens over another. A sheet cut by the window shades the edge
  with more beyond it.
- The reading screen has one status: the turn strip's `<output>`, which says
  the turn's announcement once (its visible words are `aria-hidden`).
  What happens once beside it (a round read by everyone, «استمع» that
  could not play) goes in its own polite region, so the turn is not said
  again when it clears. A page that cannot load says so in a polite
  paragraph, not a second status.
- Under the memory cover the page is `inert`: it cannot be reached or read
  aloud, which would read it for the reader. The back button with nowhere to
  go is `inert` too, its room kept.
- Each Mushaf line carries its Uthmani text, hidden from sight, for screen
  readers: the glyphs are private-use code points that mean nothing to them.
  Seats say their pages in words («الصفحة ٢٨٣», not «ص ٢٨٣»).
- The member list says every change aloud (added, moved to seat 2 of 4,
  taken out) in its own `<output>`, and keeps focus where the hand is.
  Moving is two buttons, never a drag (WCAG 2.5.7).
- Choices are native radio inputs styled as buttons (`Choice.tsx`), named by
  their label and described by their hint; on and off is a real checkbox
  with the switch role (`Switch.tsx`). The reciter list is buttons with
  `aria-pressed`, not radios: arrowing through a radio group selects as it
  goes, and choosing closes the list.
- `prefers-reduced-motion` stills every transition and animation. In forced
  colours every highlight (the active seat, the progress, the marks on the
  page) uses system colours with an outline, never a background alone.

## Settings that belong to the device

`prefs` in `state.ts`, kept apart from the halaqa (`config`) because they
are how this device looks and sounds, not how the circle reads:

- `theme`, and `photos` (below);
- `pageSize`: «الصفحة كاملة» (`fit`) or «بعرض الشاشة» (`width`, one page as
  wide as the room, scrolled down: browser zoom barely enlarges a page fitted
  to the window, WCAG 1.4.4);
- `speed` of recitations (0.75, 1 or 1.25; beyond them tajweed suffers, so
  there is no slider), `listenRepeat` (how many times «استمع» recites), and
  `follow` («تتبّع الكلمة»: mark the word recited, or the ayah);
- `cue`, a soft tone (`src/halaqa/chime.ts`, Web Audio, never on the
  recitations' element) when a turn passes on its own;
- `cardDesign`, the picture saved at the close (the framed 4:5 `ornate`,
  the default; the 9:16 `status`, kept inside the band a status or a story
  leaves clear; the square `simple`), chosen on the card and kept for the
  next sitting. All three are laid out by `src/sitting/cardImage.ts` from
  the same words (`cardText.ts`).

Appearance and sound are in the reading screen's menu and behind the gear
on the start screen. The halaqa's own «مهلة الدور» (a timed reader's turn ×1,
×1.25 or ×1.5 of the sheikh's time) and its listening sheikh are in
`config`, since they are the circle's choice.

## Photos

Reciters' photographs follow `prefs.photos`: shown, blurred, or hidden. Some
readers would rather not look at faces, or not in a sitting with others.
The choice is behind the gear on the start screen, before the first photo
appears, and in the menu. Every face goes through `ReciterFace`
(`ReciterAvatar.tsx`), which reads the choice from `PhotosContext`; a hidden
photo is not rendered, so it is never fetched, and the lock screen gets no
artwork unless photos are shown. Draw a reciter's face anywhere else and it
must go through `ReciterFace` too.

## The close of a sitting

«إنهاء المجلس» sums the sitting up at the press (`summaryOf`), stills
whatever sounds (`actions.hush()`: an ayah heard alone stopped, the rest
paused, nothing resumed) and opens «ختام المجلس» (`CloseCard.tsx`): from
where to where (or «وقفتم عند …» after a jump broke the run), pages and
ayat, how long, from what time to what time, the Hijri (Umm al-Qura) and
Gregorian dates, who sat, and the closing supplication. «احفظ صورة» draws
the same words on a `<canvas>` in the theme and the app's fonts, in the
design chosen, and hands it to the share sheet on a touch device that takes
files (`pointer: coarse` and `canShare`), or downloads it as a PNG
elsewhere. «تابعوا القراءة» goes back with nothing lost; «إنهاء» ends the
sitting. The app keeps nothing once the card is closed (ROADMAP, D2).

## Keyboard

Keys live in `src/screens/reading/useReadingKeys.ts`: one listener for as
long as the screen is open, reading what each key does when it is pressed
(`useEffectEvent`).

| Key      | What it does                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------- |
| `←`      | forward: next page in the turn, «تمّ», or skip a reciter's turn                                          |
| `→`      | back: previous page in the turn, or the previous member                                                  |
| `Space`  | pause or resume what runs: an ayah heard alone first, then a reciter's turn, a timed turn, or «استمع» |
| `Escape` | closes the ayah bar; with none open, brings the hidden bars back                                         |

Left is forward because a right-to-left book turns that way. Arrows are used
rather than letters because a single-letter shortcut must be remappable to
pass WCAG 2.1.4, and arrows are exempt. A focused button or link owns Space
and Enter, a field owns every key, a region that scrolls owns Space, and an
open sheet owns the keyboard (`dialog[open]`), so the handler steps aside
for all of them; it is off while the close card is open and at the end of
the Mushaf or the goal, where only Escape works. The ayah bar hears Escape
first because it listens on the document, which hears a key before the
window. Ayah markers are Tab stops.

If you add a key, add it to the handler, the `aria-keyshortcuts` of its
button, `KeysSection` in `SettingsPanel.tsx` (shown only with a fine pointer
that can hover), and the README.

## Layout

The reading screen is the same on every screen (`reading.css`): one column
the height of the window, never scrolled. There is no reading-order list:
the circle is the order, every seat saying what it does next.

The page fits its room whole. The room (`.mushaf-stage`, `stage.css`) is a
size container, and the page is `min(100cqw, 100cqh / --page-height)` wide,
so it is as large as the room allows in both directions with no breakpoint
deciding it. Only where that would make it narrower than 220px does it keep
220px and the room scroll. Where the room is wider than 1.2 times its height
(`min-aspect-ratio: 6 / 5`), two pages stand side by side as the Mushaf
opens, the odd one on the right (`spreadOf`); a turn of exactly two pages is
shown whole. A finger drawn across the page turns between the turn's own
pages (the longer of 48px and 12% of the room); a rightward stroke goes
forward, as a right-to-left book turns. The circle's room is a size
container too, so the circle grows from a phone to a wall; narrow circles
show short names, and under 300px the side seats show faces only.

Everything inside the page is in `cqi`, so the page is a fixed shape,
`--page-height` times its width, declared in `tokens.css` and itemised in
`mushaf.css`. Change anything inside the page and you must update
`--page-height`, or it will overflow or float in its frame.

The top bar wraps rather than cutting a name: the strip takes `flex: 1 1
7rem`, and at a large text size the controls go to a second row. Under
360px «ثم …» is hidden. The action bar is a size container: below 560px of
its own width the secondary actions drop their visible words and keep them
as names. Under 400px of viewport, and in the rails, words that give way
show their short form (`.label-short`): the main button's sub-line keeps
only the next reader's name, and the reciter's button drops his photo. The
main button's sub-line wraps; nothing in the bars is cut with an ellipsis.
The progress line carries what is left of the goal as a small pill (nothing
without a goal).

**A phone on its side** (landscape under 520px tall) keeps both bars, as
rails beside the page: the turn on the right, the actions on the left, each
`clamp(160px, 21vw, 220px)` plus the safe area. Nothing hides the bars by
itself. **Quiet mode** («إخفاء الأزرار» in the menu, `useQuiet`) hides them
and asks for the whole screen where the browser gives it; a labelled button
in the corner («إظهار الأزرار») and Escape bring them back, and the focus
goes to that button.

`scripts/check-layout.ts` measures this in Chrome at 320×568, 360×640,
375×667, 390×844, 844×390, 740×360, 568×320, 820×1180, 1100×700, 1440×900
and 2560×1440, on a timed reader's turn, a reciter's, and a circle of eight,
in the page view and the circle view, and again with the page font host
blocked: 99 screens. It fails on horizontal overflow, a page not whole, a
wrong spread, a seat off the screen, a main button under 140px or with its
words cut, a target under 44px, words under 14px in the bars, a clipped
fallback line, or bars found hidden. Its `SELECTORS` at the top are the
only names it relies on. If you add anything to the bars, measure again.

## Offline

`public/sw.js` is a hand-written service worker, registered only in
production, after the page has loaded (`src/hooks/useServiceWorker.ts`).

- **Install** fetches everything needed to open and read: the page, its
  scripts and styles, the 604 pages, the fonts, the manifest and icons. The
  list is written into the built `sw.js` by `scripts/precache.ts` (the
  `precache-list` plugin in `vite.config.ts`), each file with a hash of its
  contents. Left out: `sw.js`, `og.png`, `words/`, `reciters/`, licences and
  dotfiles. A file whose name does not change with its contents is stored
  as `url?v=hash`, so a new version's copy sits beside the old one. An
  install cut short resumes, and a new version fetches only what changed.
- **Fetch**: the page network-first; our other files cache-first, kept the
  first time they are fetched (a photo, a surah's word timings, in a cache
  named by the words' hash); the page fonts kept for good in
  `majlis-noor-page-fonts`, which no version drops; recitations never
  cached.
- **Updates** never take over an open page: GitHub Pages deletes the old
  version's files, and a sitting in progress must keep finding them. The new
  worker waits until no tab of the old one is left, or until «حدِّث الآن»
  (`UpdateNotice`, on the start screen only) asks it to take over. Activating
  deletes the other `majlis-noor-` caches and unlisted entries, then claims
  the page.

Bump `VERSION` to drop every cache it made but the page fonts. Tests:
`src/sw.test.ts`, `scripts/precache.test.ts`, `UpdateNotice.test.tsx`.

## Traps

- **A word span on the page must never be a stacking context.** Glyph ink
  overhangs into the next word; see `src/mushaf/AGENTS.md`.
- **`MushafPage` compares its props by value.** Add a prop and add it to
  `sameProps`, or the page will not redraw for it.
- **A second audio element stays silent on a phone.** Play everything
  through the one player, keyed, as `src/halaqa/AGENTS.md` describes.
- **A turn is named by `turnKey`, not its number.** A change to the circle
  moves the number on while the reader carries on.
- **jsdom has no `matchMedia`, `<dialog>` methods or playback.**
  `test-setup.ts` stands in for them; its media stub cuts a pending play
  short when paused, as a browser does. Each test has 15 seconds
  (`vite.config.ts`), since the app's tests drive whole screens and a CI
  runner is slow; the ones that read every word of the Mushaf have 30.
- **`useMarks` reads the page as drawn** (`.mushaf-stage`, `[data-ayah]`)
  to dock the ayah bar; rename those and it docks blind.
