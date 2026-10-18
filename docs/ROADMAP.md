# The revamp

The plan for taking Majlis Noor from a working first version to a calm,
complete halaqa app. It is written for whoever picks up the next piece,
human or AI. [AGENTS.md](../AGENTS.md) stays the reference for how the app
works today; this file says where it is going, in what order, and why.

Every phase leaves the app shippable. A phase is one or more pull requests,
each passing the four checks, each updating the documents it changes in the
same pass (AGENTS.md, the area's AGENTS.md, the README's feature list in
Arabic, NOTICE). Tick an item when it is merged.

## Where we start

October 2026. 196 tests pass, lint and format are clean, the build is 114 KB
of JavaScript gzipped. The foundations are good and are kept:

- the Mushaf drawn as printed, page by page, in its own fonts;
- a pure, tested model of the circle (`schedule.ts`, `state.ts`) that stores
  no history and repairs anything it reads back;
- one main button that says what happens next;
- the resume card, the reciter list with its samples and pace bands, the
  photos setting, the circle that is also the reading order;
- accessibility taken seriously: names on every control, 44px targets,
  announced turns, contrast enforced by a test.

What hurts, found by reading every file, running the app at eight sizes and
four themes, and reading what the community wrote:

1. **When a page font fails, the fallback text clips letters.** The first
   letter of many words and the ends of lines are cut off (the ر of
   «رَبَّكُمُ», «رِجَالًا», «رَقِيبًا» on page 77). The rule is never to alter
   the Quran, and a reader cannot tell this from a misprint.
2. **Offline works only after a second visit.** The service worker caches
   the HTML at install and nothing else, and it registers after the first
   load, so the scripts of the first visit are never cached.
3. **Ending a halaqa loses the place.** `end` drops the session, and the next
   halaqa starts where the last one *began*.
4. **The start screen is a long form.** Six groups of choices, all with
   defaults, put «ابدأ الحلقة» 1,034px down a phone on a first visit.
5. **Whose turn it is is quiet.** «دورك» is 14px in the corner of the top
   bar; on a desktop it sits 1,100px from the controls, and nothing marks
   the moment a turn passes, which is what the app exists for.
6. **Wide screens waste their room.** At 1440×900 the page takes 28% of the
   width; the rest is wallpaper.
7. **Settings has become a drawer for everything**: the halaqa form again,
   the jump again, appearance, sound, keyboard, about, and «إنهاء الحلقة»
   at the bottom of 2,700px on a phone.
8. **Four hosts at run time**, two of them Google's, one render-blocking.
9. **The data's terms have changed.** Quran Foundation, which runs
   Quran.com and QuranicAudio, updated its
   [developer terms](https://api-docs.quran.foundation/legal/developer-terms/)
   on 2026-10-11. They do "not … authorize distributing a prepackaged
   database or build-time bundle of QF Content", forbid keeping it "longer
   than 1 week" outside their Content Sync APIs, and hold "Derived
   Materials" to the same rules. The committed pages and timings were built
   on 2026-10-04 from the older public endpoints, which the terms do not
   name. The maintainer will write to Quran Foundation when the revamp is
   done.

## What readers asked for

From the [announcement thread](https://community.itqan.dev/d/839) on the
Itqan community. The README thanks each of them by name.

| Request | From | Where |
| --- | --- | --- |
| Mark the word or phrase being read, using recitation timings | علي ملص، دينا أحمد | 3.4, 5.2 |
| Turns by ayah or surah, not only by page | علي ملص، دينا أحمد | 3.2 |
| Turns by a number of ayat | خالد بن أحمد، علا صالح | 3.2 |
| More than four in the circle | علي ملص | 4.3 |
| A teaching circle: the sheikh recites, the students repeat; stop at a place and repeat it | دينا أحمد | 3.5, 3.6 |
| Two readers alternating ayat, swapping who starts each page or surah | علا صالح | 4.4 |
| Where a sitting starts and ends, and a summary at its close kept on the device without an account | علا صالح | 4.1, 4.2 |
| The close of a sitting saved as a picture on the device | محمد إدريس | 4.2 |
| Hear one ayah alone when unsure how a word is read | محمد إدريس | 3.5 |
| Turns by phrase or by topic; timings from Munajjam; reading together from several devices | علي ملص، خالد بن أحمد، هادي الأحمد | *Not in this revamp* |

The Somali review circle that inspired the app, as يوسف حجازي
[describes it](https://community.itqan.dev/d/817), goes round a few ayat
at a time, quickly, until the khatm. 3.2 brings Majlis Noor closer to it,
and 4.5 serves those who review from memory.

## Principles

Kept as they are:

- The order of importance on every screen: **1. the Quran, 2. the current
  reader, 3. the next reader, 4. progress, 5. everything else.** When unsure
  whether to add an element, leave it out.
- Never alter the Quran. The page is a page.
- No accounts, no analytics, no points, streaks, badges or charts.
- Arabic interface, right to left.
- Data is built once by scripts from a named source, committed, and never
  fetched from an API at run time.

Sharpened:

- **One device, one circle.** The app runs a halaqa gathered around one
  screen, and nothing a reader does leaves that device.
- **For every age.** Large targets, plain words, one main action at a time,
  nothing that has to be read twice to be understood.
- **Two hosts at run time, both Quran Foundation's:** the recordings, which
  are too large to carry, and the page fonts. Everything else comes from
  the app's own origin.
- **No run-time dependency but React.** Base UI and lucide go in phase 1.
  A dependency added later needs a reason in AGENTS.md why there was no way
  around it.
- **The app keeps no history.** The close of a sitting shows what was read,
  how long and who sat, and the reader may save it as a picture on their
  device. The app itself stores nothing about past sittings, and never
  sums them up.

## Decisions

Taken by the maintainer on 2026-10-18.

- **D1. Eight seats.** The circle is computed for any number up to eight,
  with a compact layout from seven on a phone.
- **D2. No log.** A summary at the close of every sitting, which the reader
  can save as a picture; nothing kept in the app.
- **D3. The page fonts stay on Quran.com's host,** fetched as they are
  today and kept by the service worker. Carrying them ourselves waits for
  the maintainer's letter to Quran Foundation, sent when the revamp is
  done.
- **D4. No remote halaqa** in this app (see *Not in this revamp*).
- **D5. Two pages side by side** on a wide screen, automatically when the
  room is wider than 1.2 times its height.

## Phase 0. Make what exists trustworthy

Small fixes, first, because every later phase builds on them.

- [ ] **0.1 The fallback page never clips.** In text mode
  (`[data-font='text']`, `mushaf.css:112-121`) each line is `nowrap` with
  `overflow: hidden`. Fit each line to its width instead (measure once,
  scale the line's font size down, never up), and show a quiet note under
  the page, «تعذّر تحميل خطّ الصفحة، والنص معروض بخطّ بديل», with a retry.
  Test: the layout check (see *Quality*) blocks the font host and fails if
  any line's `scrollWidth` exceeds its `clientWidth`.
- [ ] **0.2 Offline from the first visit.** Vite writes the list of built
  assets into the service worker at build time (a few lines in
  `vite.config.ts`), and `install` caches them, the page data and the
  timings: the whole Mushaf's text and every reciter's timings come to
  under 1 MB gzipped. Recordings stay uncached.
- [ ] **0.3 A page that cannot load says so.** `usePage.ts` swallows the
  error and leaves the skeleton up with `aria-busy` forever. Show «هذه
  الصفحة غير محفوظة على جهازك بعد» with a retry.
- [ ] **0.4 Ending keeps the place.** `end` writes the current page into
  `config.startPage`, so the next halaqa starts where this one stopped
  (`state.ts:238`, test in `state.test.ts`). Until 4.2 exists, «إنهاء
  الحلقة» asks once.
- [ ] **0.5 Playback edges.** The timer says «بقي أقل من ثانية» while
  timings are still loading (`ActionBar.tsx:245`); `prime()` returns early
  once primed, so a later `blocked` is not resumed by a tap anywhere
  (`player.ts:215`); a sample that fails says nothing
  (`useRecitation.ts:308`); a reciter's turn whose audio fails stalls with
  no hint to skip.
- [ ] **0.6 What screen readers and reduced motion miss.** Under reduced
  motion the round toast ends on its last keyframe, opacity 0, so it is
  never seen (`reading.css:358`). Round completion and recitation errors
  are not announced (`ReadingScreen.tsx:245`). The repeat mode's `skipped`
  seat is computed and never shown or said (`HalaqaCircle.tsx:105`).
- [ ] **0.7 Focus survives a turn change.** The main button is a different
  component on a reader's turn and a reciter's, so passing between them
  drops focus to `body`. Keep one element and change what it says.
- [ ] **0.8 Label in name (WCAG 2.5.3).** The pages-per-turn radios show
  «١» and are named «صفحة واحدة»; the recitation, listen and timer buttons
  are named differently from what they show. The accessible name starts
  with the visible words. `app.test.tsx` gains the check.
- [ ] **0.9 Hygiene.**
  - The repository's address is written into `SettingsPanel.tsx:158,169`.
    The workflow passes it as `VITE_REPO_URL`, as it does the site's.
  - Theme colours are written in five places. Keep one map in TypeScript
    and let Vite write `index.html`'s from it.
  - Remove what nothing uses: `isPastEnd`, `surahTitle`, `LINES_PER_PAGE`,
    `readersCount`, `averagePage`, the `Sheet` `wide` prop,
    `.field-label-small`, the `matchMedia` shim in `test-setup.ts`.
    `rubOfPage` and the quarter field in `mushaf.json` are unused too, but
    3.1 needs them; keep them until then.
  - `mushaf.css:30` writes a colour of its own; take it from a token.

Done when each has its test, and a phone in airplane mode opens the app and
the last pages read, after one online visit.

## Phase 1. Stand on our own

Fewer hosts, fewer packages, nothing render-blocking.

- [ ] **1.1 Self-host the interface fonts.** All four are under the SIL
  Open Font License, taken from their upstream releases, as woff2 in
  `public/fonts`, each family's `OFL.txt` beside it and an entry in NOTICE:
  - IBM Plex Sans Arabic from [IBM/plex](https://github.com/IBM/plex)
    (`@ibm/plex-sans-arabic`). "Plex" is a Reserved Font Name, and a
    subset is a modified font, so ship IBM's own files unmodified, about
    74 KB a weight. Two weights instead of three if 2.1 allows.
  - Reem Kufi from [aliftype/reem-kufi](https://github.com/aliftype/reem-kufi)
    and Amiri from [aliftype/amiri](https://github.com/aliftype/amiri) may
    be subset (no Reserved Font Name that applies); Reem Kufi is one
    variable file of about 12 KB for the Arabic it draws.
  - Amiri Quran (same repository) is the fallback for the Quran's text, so
    it is **not** subset: a script checks that every character in the 604
    pages' text is in its character map (a woff2 is a brotli stream, which
    `node:zlib` reads) and fails otherwise.

  `font-display: swap` for the interface, `unicode-range` to split Arabic
  from Latin, and a preload (through `%BASE_URL%`, with `crossorigin`) only
  for Reem Kufi, which draws the boot screen, and the body weight.
- [ ] **1.2 The page fonts (D3).** The 604 QCF v2 fonts are 93 MiB in
  all, 41 KB to 227 KB each (170 KB median), served byte for byte the same
  by Quran.com's and Tarteel's hosts, with open CORS and a year's cache. The
  King Fahd Complex lets its fonts be used, copied and distributed free,
  but not "Sold, Modified, Altered", so they cannot be subset. Quran
  Foundation's terms let an app "cache or bundle font files" if its
  developer "maintains an active account in the Developer Console" and
  credits them, and only "as an integrated part of the Application". So,
  for this revamp, keep fetching them from `static.qurancdn.com` as today,
  with a retry and 0.1's honest fallback, and let the service worker keep
  every page font it has fetched. If Quran Foundation later agrees to more,
  the deploy workflow can download the fonts, check each against a
  committed list of SHA-256 hashes, and put them in the built site without
  ever committing them to git.
- [ ] **1.3 A native dialog.** `Sheet.tsx` is the only use of Base UI, and
  Base UI is 9 packages and about 53 KB of the bundle. A `<dialog>` opened
  with `showModal()` (every browser since Safari 15.4 and Firefox 98) gives
  the top layer, an inert page and Escape. It needs, by hand:
  - the backdrop tap, since `closedby` is not in Safari yet (check the
    event's target against the dialog itself);
  - initial focus on the title, and focus back to the opener on close,
    which Safari does not promise;
  - `html:has(dialog[open]) { overflow: hidden }` for scroll lock, and the
    browser's default margin and maximum sizes reset for a bottom sheet;
  - the enter animation with `@starting-style`; the exit animated in
    script before `close()`, since only Chrome animates it otherwise;
  - in React, opened and closed through a ref, never the `open` attribute,
    with state synced from the `close` event.

  The key handler's `[role="dialog"]` test becomes `dialog[open]`; jsdom
  has no `showModal`, so `test-setup.ts` stubs it.
- [ ] **1.4 Our own icons.** Twenty-three lucide icons become small
  components in `src/components/icons.tsx`; lucide's ISC notice goes in
  NOTICE.
- [ ] **1.5 Page data off the main bundle.** The 604-entry
  `import.meta.glob` map is about 36 KB of the main script. Write the pages
  to `public/pages/<n>.json` and fetch them by address, which also makes
  0.2's list simpler.
- [ ] **1.6 A content security policy.** A `<meta>` policy that allows the
  app's own origin, the audio host and, until 1.2 is done, the page fonts'
  host, and nothing else. It enforces this phase and documents it in one
  line.
- [ ] **1.7 Watch the one host left.** QuranicAudio is a Quran
  Foundation project with open CORS and range requests, and there is no
  byte-identical mirror. Its files are replaced in place (al-Husary's carry
  dates from 2023 to 2025), and a timing is only right for the file it was
  made from. So the timings files record each surah file's length and
  `last-modified`, `check:audio` compares them, and a weekly workflow runs
  it: a replaced or moved recording is found before a reader finds it.

Done when the app's only run-time host besides its own origin is the audio
host (and the page fonts' if D3 says so), and `package.json` lists React
and React DOM as its only dependencies.

## Phase 2. The interface

**Direction.** A quiet room with the Mushaf open in the middle. One deep,
flat ground per theme and no wallpaper on the reading screen; the ivory
page is the only bright thing on the screen. Everything else gathers into
two calm bands: who reads now (large) and who reads next (muted), beside or
above the page; one generous action below it. Gold only for the current
reader and the main action. Type a size larger than feels necessary for
Arabic. No duplicate controls.

- [ ] **2.1 Tokens.** A type scale with a floor of 15px for text and 14px
  for metadata (today notes are 13px and hints 12.5px); a line height of
  1.7 for prose and 1.4 inside controls, which ends the orphans in the
  choice cards; a spacing scale; no `letter-spacing` on Arabic. The carpet
  pattern draws a rule every 132px that reads as stripes: the reading
  screen loses it, the start screen keeps one faint motif at most. Sand
  gets a deeper ground so the page keeps its edge. `contrast.test.ts`
  covers every new pair, including `color-mix()` results.
- [ ] **2.2 A start screen that fits.** On a 390×844 phone, a first visit
  shows everything needed above the fold: a one-line header, «من أين
  نبدأ؟», the circle, and «ابدأ الحلقة», which sticks to the bottom. How
  the circle reads (continue or repeat, how much per turn, manual or
  timed, the allowance) folds into one summary row, «التتابع · صفحة · يدوي»,
  that opens a sheet. A lone «أنت» shows no disabled arrows, and its field
  says «اسمك (اختياري)». The resume card stays first.
- [ ] **2.3 One word for each thing.** «قارئ» is always a person in the
  room, «شيخ» always a recording. «بتوقيت قارئ» becomes «بتوقيت الشيخ»;
  the listening and timing sheikh is chosen inside the timed option and
  from «استمع», not as a separate row; the teaching recording is named
  «الحصري (المعلّم)». Also: «الدور على: أنت» → «دورك»; reading alone,
  «تمّ — متابعة» → «الصفحة التالية»; «بداية المجلس» → «لم تُقرأ صفحة بعد».
- [ ] **2.4 The turn, visible.** A turn strip above the page (beside it on
  a wide screen): the current reader's avatar and name at 20–24px, «ثم
  فاطمة» muted after it. When the turn passes, the strip changes with one
  400ms motion and the gold ring moves; under reduced motion it changes at
  once. The jump gets a visible chip, «ص ٥٠», instead of an invisible
  button the width of the bar.
- [ ] **2.5 One of each control.** The page row beside «تمّ» becomes a slim
  progress line; a timed turn shows its clock once, not three times;
  «القارئ السابق» is not shown on the first turn; swipe turns the page the
  way an Arabic book turns, as the arrow keys do. The keyboard list shows
  only on devices with a fine pointer.
- [ ] **2.6 Wide screens (D5).** When the room is wide, two pages side by
  side as the Mushaf opens: the odd page on the right, as print has it, the
  turn's pages marked. Controls scale with `clamp()` instead of staying at
  14px on a 2560px screen. The jump opens as a centred dialog on a
  desktop, not a full-height drawer.
- [ ] **2.7 Settings on a diet.** Settings keeps appearance, sound and
  about. The circle is changed from the circle view («عدّل الحلقة»), the
  place from the jump, and «إنهاء المجلس» moves to the top bar.
- [ ] **2.8 Reading at any size (WCAG 1.4.4).** Today the page fits its
  room whole, so browser zoom barely enlarges it. A page-size setting,
  «الصفحة كاملة» or «بعرض الشاشة», lets the page fill the width and scroll.
- [ ] **2.9 Quiet modes.** A button hides the bars (a tap on the page is
  kept for 3.5's ayah); a phone on its side hides them on its own; the
  Fullscreen API where the browser has it.
- [ ] **2.10 Follow the system.** A first visit takes sand if the system is
  light and green if it is dark (`prefers-color-scheme`, in the inline boot
  script); `<meta name="color-scheme">` and a `theme-color` per scheme.
  Forced colours: the active seat, progress and every new highlight use
  system colours (`Highlight`, `Mark`) with an outline, never a background
  alone.
- [ ] **2.11 The khatm.** The most meaningful moment in the app gets the
  Mushaf's own ornament and a quiet layout, not a generic card.
- [ ] **2.12 Code that fits in a head.** `ReadingScreen.tsx` (546 lines)
  splits into a `useTurn` hook (what the turn is, its clock, recitation and
  listen), `useReadingKeys` (one listener, with `useEffectEvent`, bound
  once instead of on every render), and `TopBar`, `TurnStrip`,
  `MushafView`, `CircleView`, `TurnActions`, `JumpSheet` and `Khatm`. The
  clock's four ticks a second re-render only the clock (a
  `useSyncExternalStore` subscription), not the page. The announcement
  text moves into `labels.ts` and gets tests. `reading.css` (780 lines) and
  `base.css` (560) split by component, in cascade layers.

Done when the layout check passes at every size it lists, a first-time
reader on a phone starts a halaqa without scrolling, and the README's
screenshots are new.

## Phase 3. Reading by the ayah

Everything here rests on two facts: every word in the page data already
carries its verse key (`"17:105"`), and the Madani Mushaf ends every page
on a whole ayah. The timing source already returns per-ayah and per-word
times; `build-timings.ts` reads them and keeps only page stretches.

- [ ] **3.1 The data.** `mushaf.json` gains, derived from the
  pages and checked against them by the test, the first ayah of each page
  (604 numbers) and of each quarter-hizb (240). The quarters come from the
  ۞ in the print itself: the committed text holds 199 of them, every one at
  the API's quarter start, and the other 41 quarters begin a surah, where
  the print has the surah's header instead. (Tanzil's quarters follow the
  older 1405H print and disagree; do not mix them in.) Each
  `timings/<id>.json` keeps the start and end of every ayah in its
  recording, about 15 KB gzipped per reciter; the API's own `duration`
  field is wrong in places (negative for al-Shatri and al-Husary at 1:1),
  so ends come from the timestamps. The Quran's text is not touched.
- [ ] **3.2 Units.** `schedule.ts` counts in units instead of pages:
  `Plan = { readers, mode, unit, size }` with `unit` one of `page`,
  `ayah`, `rub` or `surah`, and `Anchor = { turn, at }`. A new pure
  `rangeOf(plan, anchor, turn)` gives the turn's ayat as a half-open range,
  and the pages follow from the index. `readerOf`, `round` and `endsRound`
  do not change. `sanitizeState()` reads the old shape (`pagesPerTurn`,
  `anchor.page`) as `unit: 'page'`. The repeat branch of `configure` is the
  delicate part: its cases are copied for each unit. In the interface the
  choice stays small: «صفحة» (one to three), «آيات» (one, three or five),
  «ربع حزب», «سورة».
- [ ] **3.3 The turn on the page.** The turn's ayat are marked on the page
  with a soft underline (lines are justified edge to edge, so a background
  would leave gaps). The turn strip says «الآيات ٥–٩». When a turn of ayat
  runs onto the next page, the page turns with it.
- [ ] **3.4 Following the sheikh.** During a sheikh's turn and «استمع», the
  ayah being recited is marked. The player exposes its position; the
  per-ayah times map it to a verse key. Timings are good to about 300ms,
  so the mark leads softly and fades rather than snapping; under reduced
  motion it does not fade.
- [ ] **3.5 One ayah alone.** Tap a word and its ayah is selected; a small
  bar offers «استمع إلى الآية» and «كرّر ثلاثًا», and closes with Escape or
  a tap outside. A sheikh's turn pauses for it and carries on after, as a
  sample does today. For the keyboard and screen readers, each ayah's end
  marker is a button named «الآية ٧، آل عمران: استمع» (an inline target,
  which WCAG 2.5.8 allows).
- [ ] **3.6 The teaching circle, obvious.** Repeat mode, ayat as the unit,
  and «الحصري (المعلّم)» in the first seat already make talqeen: the sheikh
  recites a few ayat, then each student reads them. Offer it as one choice
  on the start screen, «حلقة تلقين», that sets those three.

Done when each unit has its schedule and state tests (including the old
saved shape), the timings tests check that ayah starts are in order and
fall inside their page's stretch, and every new control has a name.

## Phase 4. The sitting

- [ ] **4.1 Start and end.** `start` records the time and place it began
  (the time comes in the action, so the reducer stays pure). An optional
  goal, «إلى أين؟»: the end of the surah, the end of the juz, a page, or
  none. The 604 cut-off generalises to the goal; reaching it shows
  «بلغتم الغاية» with «تابعوا» and «اختموا المجلس».
- [ ] **4.2 The close.** «إنهاء المجلس» shows a summary card: from where to
  where (surah, ayah and page), how many pages and ayat, how long, and who
  sat. The close of a gathering has its own supplication, «سبحانك اللهم
  وبحمدك، أشهد أن لا إله إلا أنت، أستغفرك وأتوب إليك», which ends the card.
  «احفظ صورة» draws the same card on a `<canvas>` (no library: the page's
  own fonts, right to left) and hands the picture to the system's share
  sheet where it takes files, or downloads it as a PNG otherwise, so it
  lands in the reader's photos or files. It is made on the device and sent
  nowhere. The app keeps nothing once the card is closed (D2).
- [ ] **4.3 More seats (D1).** `MAX_MEMBERS` becomes eight. Member ids are
  checked by `^[pr]\d+$` and a bound, not a character class that breaks at
  ten. Seat angles are computed (`90 - 180/n`, then `360/n` apart), which
  reproduces today's four. From seven on a phone the circle shows names
  only for the current and next reader and initials for the rest.
- [ ] **4.4 Swapping who starts.** For two or more readers taking ayat in
  turn: «بدّل البادئ مع كل صفحة» (or surah). This is the one feature that
  breaks the rule that the reader is `turn % members`. Do it in the reducer
  instead: at the first turn of a new page, skip the turn counter forward
  to the seat after the last page's first reader and re-anchor there; give
  «القارئ السابق» across that line its own tests.
- [ ] **4.5 From memory.** For review circles like the Somali one: on a
  reader's turn the page is covered, and a tap or a key uncovers it to
  check. One choice in the circle's sheet.

## Phase 5. Word by word

- [ ] **5.1 The data.** The response `build-timings.ts`
  already fetches carries word segments for all ten reciters,
  `[word, fromMs, toMs]` per ayah, with absolute times in the surah file.
  Two things to know: when a reciter stops and goes back (waqf and
  ibtida'), word numbers repeat while time runs on, so a word is found by
  time, never by its number; and quality differs by reciter, measured over
  the whole Quran:

  | Reciter | Ayat fully covered | Note |
  | --- | --- | --- |
  | al-Husary, al-Minshawi, al-Sudais, al-Rifai | 6,183–6,214 | clean, one malformed entry at most |
  | al-Husary (teaching) | 6,216 | each ayah ends in a silence for the learner |
  | al-Dosari | 6,222 | 587 gaps over 300ms |
  | al-Shuraim | 6,223 | records no repeats at all, which is suspicious |
  | al-Afasy | 6,065 | 70 malformed entries |
  | Abdul Basit | 6,056 | surahs 30–37 broken |
  | al-Shatri | 6,009 | weakest: 4,154 gaps over 300ms |

  The script drops malformed entries, clamps each word to its ayah, keeps
  repeats in time order, and writes one file per reciter per page (about
  1 KB, 450 bytes gzipped) so a page loads only its own. Where an ayah's
  words are not fully covered, that ayah falls back to the ayah mark of
  3.4; the timings test reports coverage per reciter so a regression shows.
  Internally the script works in the shape of QUD³'s open benchmark (a
  time-ordered list of `{ word: "84:1:1", start, end }`), so its results
  can be scored against it.
- [ ] **5.2 Following the word.** An option, «تتبّع الكلمة»: during a
  sheikh's recitation the word being read is marked, with the same soft
  lead as the ayah (word timings are good to about 300ms, the benchmark's
  own tolerance). Off while paused, still under reduced motion.
- [ ] **5.3 Play from a word.** In 3.5's bar: «استمع من هذه الكلمة».
## Not in this revamp

Each of these was asked for and is a good idea; each was left out on
purpose, so the reason is written down.

- **Reading together from several devices** (علي ملص، هادي الأحمد). Majlis
  Noor is one screen around which a circle sits, for every age, and needs
  nothing but a browser. Peer-to-peer rooms, invitations and relays are a
  different app, and a good one to build on their own.
- **Turns by phrase.** They need breath or waqf segments for every
  recording, which the timing source does not give.
- **Turns by topic.** The trustworthy topical divisions found are licensed
  for non-commercial use without derivatives; until one is free to use,
  the quarter-hizb is the Mushaf's own division and the nearest to it.
- **Timings from Munajjam.** The API's own word timings serve every
  reciter here (5.1); Munajjam stays the tool to reach for if a reciter is
  added that the API does not time.
- **Carrying the page fonts** (D3), until Quran Foundation's answer.

## Data

| Data | Source | Terms | Built by | Served from |
| --- | --- | --- | --- | --- |
| Mushaf pages | Quran.com API v4 | Quran Foundation's | `build-mushaf.ts` | own origin |
| Page and quarter index | derived from the pages | as the pages | `build-mushaf.ts` | own origin |
| Page fonts | King Fahd Complex, via Quran.com | free, unmodified; QF's for bundling | not built (1.2) | `static.qurancdn.com` |
| Interface fonts | each font's upstream release | OFL 1.1 | by hand, once | own origin |
| Ayah and word timings | Quran.com `qdc` audio API | Quran Foundation's | `build-timings.ts` | own origin |
| Recordings | QuranicAudio (Quran Foundation) | free for non-commercial use | not built | `download.quranicaudio.com` |
| Reciters' photos | Wikimedia Commons | per photo, in NOTICE | by hand | own origin |

## Dependencies

| Today | After | Why |
| --- | --- | --- |
| React, React DOM | kept | the app |
| `@base-ui/react` (dialog) | native `<dialog>` (1.3) | one component, 9 packages |
| `lucide-react` | `icons.tsx` (1.4) | 23 icons |
| Google Fonts | self-hosted (1.1) | render-blocking, a third party |
| `static.qurancdn.com` | kept, cached by the service worker (1.2) | 93 MiB of fonts, theirs to give (D3) |
| `download.quranicaudio.com` | kept, checked weekly (1.7) | recordings are gigabytes |

## Quality

These hold for every pull request in every phase.

- **The four checks pass:** `npm test`, `npm run lint`, `npx oxfmt --check`,
  `npm run build`.
- **The state's shape changes only with tests:** a round trip, a hostile
  value and the old shape through `sanitizeState()`.
- **WCAG 2.2 AA.** Names that start with the visible words; nothing hidden
  under the sticky bars (`scroll-padding`); forced colours and reduced
  motion for everything new; reflow at 320px.
- **The layout is measured.** A script, `scripts/check-layout.ts`, drives
  the Chrome installed on the machine, as `make-assets.ts` already does,
  through its DevTools protocol (Node has `WebSocket` built in), so it adds
  no dependency. It checks the sizes AGENTS.md lists (320×568 to
  2560×1440), in each view and turn kind: no horizontal overflow, the page
  whole, no seat off the screen, the main button's words whole, and in
  text mode no clipped line (0.1). Run it before any layout change.
- **A budget.** The main script does not grow past today's 114 KB gzipped,
  though the app does more: Base UI and the page map leave room for what
  comes. The page is drawn within two seconds on a mid phone on 4G.
- **The documents move with the code,** in the same pull request.

## Order

Phases 0 and 1 are made of pieces that are independent of each other and
come first. Phase 2 comes before 3, because the turn strip and the wide
layout are where the ayah marks and the ayah bar live; 3.1 and 3.2, which
are data and model, can start at once. Phase 4 follows 3, since the
summary counts ayat. Phase 5 follows 3.4.

| Phase | Size | Waits on |
| --- | --- | --- |
| 0. Trustworthy | small, many pieces | nothing |
| 1. On our own | medium | nothing |
| 2. The interface | large | 0 |
| 3. By the ayah | large | 2, for 3.3 to 3.6 |
| 4. The sitting | medium; 4.4 is delicate | 3 |
| 5. Word by word | medium | 3.4 |
