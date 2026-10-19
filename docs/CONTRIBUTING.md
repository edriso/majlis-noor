# Working on Majlis Noor

This is the on-ramp. It assumes you know React and have never seen this
repository, and it does not assume you read Arabic. [AGENTS.md](../AGENTS.md)
is the reference behind it; read this for *where*, and that for *why*.

## In one minute

A few people want to read the Quran together the way a mosque halaqa does:
one reads aloud while the others follow, then the next reader takes the
next part (or, in repeat mode, the same part). A turn can be a page, a few
ayat, a hizb quarter or a surah. This app keeps the circle for them: it
shows the page, whose turn it is and who is next, and one button passes the
turn on. A seat in the circle can also go to a recorded reciter, whose
recitation plays on his turn, so a group can read with a sheikh. At the end,
a card sums the sitting up, and can be saved as a picture.

There is no server. The app is a static page, the Mushaf pages are JSON files
in `public/pages`, and the halaqa is saved in `localStorage`.

## Get it running

```sh
npm install
npm run dev
```

Before you commit, all of these must pass. CI runs the same.

```sh
npm test
npm run lint
npx oxfmt --check     # npm run format fixes it
npm run build
```

## Picking something to work on

[ROADMAP.md](ROADMAP.md) is the plan the app was rebuilt by: each item with
the files it touches and what "done" means, ticked as it was merged. Most
of it is done. What is left is unticked there, and the reasons some good
ideas were left out are in its last sections; read those before proposing
one of them again. Say in an issue what you are taking, and update the
ROADMAP in the pull request that finishes it.

## Where to go for what

| You want to change…                        | Open                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| who reads what, continue / repeat, units   | `src/halaqa/schedule.ts`, `src/halaqa/state.ts`                         |
| who sits in the circle, and their order    | `Members` in `src/components/HalaqaForm.tsx`                            |
| how the circle reads (its sheet)           | `src/components/CircleOptions.tsx`, `src/halaqa/circleLabels.ts`        |
| what the start screen asks                 | `src/screens/SetupScreen.tsx`                                           |
| where to start, and the jump               | `src/components/PlacePicker.tsx`                                        |
| the reading screen                         | `src/screens/ReadingScreen.tsx`, `src/screens/reading/`                 |
| what a turn is, as the screen shows it     | `src/screens/reading/useTurn.ts`                                        |
| the bar at the top                         | `src/screens/reading/TopBar.tsx`, `TurnStrip.tsx`                       |
| the buttons under the page                 | `src/components/ActionBar.tsx`, `src/screens/reading/TurnActions.tsx`   |
| what the screen says (every label)         | `src/halaqa/labels.ts` (tested)                                         |
| the circle, which is also the order        | `src/components/HalaqaCircle.tsx`, `src/screens/reading/CircleView.tsx` |
| the keys                                   | `src/screens/reading/useReadingKeys.ts`                                 |
| how a recitation plays                     | `src/halaqa/player.ts`, `useRecitation.ts`, `useAyahListen.ts`          |
| marking what is recited                    | `src/mushaf/useFollow.ts`, `usePlaybackPosition.ts`, `styles/marks.css` |
| the ayah bar                               | `src/mushaf/AyahBar.tsx`                                                |
| the reciter list, its samples and paces    | `src/components/ReciterPicker.tsx`, `src/data/reciters.ts`              |
| colour, photos and sound settings          | `src/components/Preferences.tsx`                                        |
| the menu                                   | `src/components/SettingsPanel.tsx`                                      |
| a sheet, and how it opens and closes       | `src/components/Sheet.tsx`, `styles/sheet.css`                          |
| the close of a sitting and its picture     | `src/components/CloseCard.tsx`, `src/sitting/`, `styles/close.css`      |
| how a Mushaf page is drawn                 | `src/mushaf/MushafPage.tsx`, `styles/mushaf.css`                        |
| the reciters                               | `src/data/reciters.ts`, then `npm run build:timings` and `npm run check:audio` |
| colours and themes                         | `src/styles/tokens.css`, `src/styles/themes.ts` (contrast is tested)    |
| the reading screen's layout                | `src/styles/reading.css`, `topbar.css`, `stage.css`, `action-bar.css`   |
| the icons                                  | `src/components/icons.tsx`                                              |
| Arabic numbers and counted nouns           | `src/data/arabic.ts`                                                    |

## A first change, end to end

Say you want turns of seven ayat.

1. `TURN_SIZES` in `src/halaqa/state.ts` is the one table of what a turn
   may hold. Add 7 to `ayah`. The circle's sheet offers what it lists and
   `sanitizeConfig()` keeps to it, so a saved halaqa with seven ayat is
   kept and anything else is repaired.
2. Nothing else needs a word written by hand: the choice shows «٧» and is
   heard as «٧ آيات» (`ayatCount`, through `spokenSuffix`), and the summary
   row and the turn strip count it the same way. The schedule, the timed
   turn and the reciter's recitation work for any size.
3. Add a case to `src/halaqa/state.test.ts` that reads seven ayat a turn
   and goes round onto the next page, and run `npm test`. `app.test.tsx`
   checks that the new option's name begins with what it shows.
4. Look at the circle's sheet on a phone (320px and 390px wide): the five
   ayat sizes share one row there, and a sixth must still fit, or wrap
   cleanly, with every option at least 44px wide.
5. Update the README's feature list, which is in Arabic. If you do not write
   Arabic, say so in the pull request and someone will.

A seat needs no such change: the circle places any number of seats up to
`MAX_MEMBERS` (eight, ROADMAP D1) with `seatAngles(n)` in
`HalaqaCircle.tsx`, and the layout check measures a circle of eight.

## Things that will bite you

- **The Mushaf data is generated.** Never edit `public/pages/*.json` by
  hand; change `scripts/build-mushaf.ts` and rebuild. The tests check every
  ayah.
- **Sizes inside the page are tied together.** Change a line height in
  `mushaf.css` and you must update `--page-height` in `tokens.css`. The
  fallback text mode overrides `--page-height` on its own page.
- **Marks on the page never move a glyph.** They are pseudo-elements in one
  layer under the words; a word span must never become a stacking context.
  See `src/mushaf/AGENTS.md`.
- **Layout.** Run `node scripts/check-layout.ts` before and after a change
  to the reading screen's layout. It measures 99 screens in Chrome.
- **Paths.** The site lives under a sub-path on GitHub Pages; use
  `%BASE_URL%` in `index.html` and `import.meta.env.BASE_URL` in code.
- **Arabic numerals.** Use `arabic()` and the counters in `arabic.ts`, never
  a number pasted into a string.
- **Colours.** Use the tokens in `tokens.css`, never a colour of your own:
  the sand theme is light, and a shadow or a tint written for a dark ground
  looks wrong on it. Never fade with `opacity`; use `--muted` or `--disabled`.
- **Sound.** Play nothing except through `player.ts`. A second audio element
  is one a phone has not unlocked, and it will stay silent.
- **A new third-party file** (photo, font, data, icon) needs its line in
  `NOTICE`; a new font folder fails `fonts.test.ts` until it has one.
