# Working on Majlis Noor

This is the on-ramp. It assumes you know React and have never seen this
repository, and it does not assume you read Arabic. [AGENTS.md](../AGENTS.md)
is the reference behind it; read this for *where*, and that for *why*.

## In one minute

A few people want to read the Quran together the way a mosque halaqa does:
one reads a page aloud while the others follow, then the next reader takes
the next page (or, in repeat mode, the same page). This app keeps the circle
for them: it shows the page, whose turn it is and who is next, and one button
passes the turn on. A seat in the circle can also go to a recorded reciter,
whose recitation plays on his turn, so a group can read with a sheikh.

There is no server. The app is a static page, the Mushaf pages are JSON files
in the repository, and the halaqa is saved in `localStorage`.

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

[ROADMAP.md](ROADMAP.md) lists what comes next, phase by phase, each item
with the files it touches and what "done" means. Phase 0 is made of small,
separate fixes and is the best place for a first pull request. Say in an
issue which item you are taking, and tick it in the pull request that
finishes it.

## Where to go for what

| You want to change…                        | Open                                          |
| ------------------------------------------ | --------------------------------------------- |
| who reads which page, continue / repeat    | `src/halaqa/schedule.ts`, `src/halaqa/state.ts` |
| who sits in the circle, and their order    | `Members` in `src/components/HalaqaForm.tsx`  |
| what the start screen asks                 | `src/screens/SetupScreen.tsx`, `src/components/HalaqaForm.tsx` |
| the reading screen                         | `src/screens/ReadingScreen.tsx`               |
| the buttons under the page                 | `src/components/ActionBar.tsx`                |
| the circle, which is also the order        | `src/components/HalaqaCircle.tsx`             |
| how a recitation plays                     | `src/halaqa/player.ts`, `useRecitation.ts`    |
| the reciter list, its samples and paces    | `src/components/ReciterPicker.tsx`, `src/data/reciters.ts` |
| colour, photos and sound settings          | `src/components/Preferences.tsx`              |
| the settings drawer                        | `src/components/SettingsPanel.tsx`            |
| how a Mushaf page is drawn                 | `src/mushaf/MushafPage.tsx`, `styles/mushaf.css` |
| the reciters                               | `src/data/reciters.ts`, then `npm run build:timings` and `npm run check:audio` |
| colours and themes                         | `src/styles/tokens.css` (contrast is tested)  |
| the reading screen's layout                | `src/styles/reading.css`                      |
| Arabic numbers and counted nouns           | `src/data/arabic.ts`                          |

## A first change, end to end

Say you want a fifth seat.

1. `MAX_MEMBERS` in `src/halaqa/state.ts` is the limit; `newMember()` stops
   there and `sanitizeConfig()` cuts stored members to it. The member ids
   (`p1`…`p4`) are checked against it too.
2. The circle needs seat angles for five in `SEAT_ANGLES`
   (`HalaqaCircle.tsx`), spaced evenly and starting at the near right.
3. Add a case to `src/halaqa/state.test.ts` that seats five and goes round
   them, and run `npm test`.
4. Look at the circle on a phone (320px and 390px wide) and at 1440px:
   seat names on the upper arc sit above the circle and must stay on the
   screen.
5. Update the README's feature list, which is in Arabic. If you do not write
   Arabic, say so in the pull request and someone will.

## Things that will bite you

- **The Mushaf data is generated.** Never edit `src/data/pages/*.json` by
  hand; change `scripts/build-mushaf.ts` and rebuild. The tests check every
  ayah.
- **Sizes inside the page are tied together.** Change a line height in
  `mushaf.css` and you must update `--page-height` in `tokens.css`.
- **Paths.** The site lives under a sub-path on GitHub Pages; use
  `%BASE_URL%` in `index.html` and `import.meta.env.BASE_URL` in code.
- **Arabic numerals.** Use `arabic()` and the counters in `arabic.ts`, never
  a number pasted into a string.
- **Colours.** Use the tokens in `tokens.css`, never a colour of your own:
  the sand theme is light, and a shadow or a tint written for a dark ground
  looks wrong on it.
- **Sound.** Play nothing except through `player.ts`. A second audio element
  is one a phone has not unlocked, and it will stay silent.
- **A new third-party file** (photo, font, data) needs its line in `NOTICE`.
