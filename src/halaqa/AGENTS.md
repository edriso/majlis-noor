# src/halaqa

Who reads what, and everything that changes it; and the sound that plays
during a turn. No React here except the files named `use*.ts`.

| File                     | What it is                                                                      |
| ------------------------ | ------------------------------------------------------------------------------- |
| `schedule.ts`            | pure functions: a turn number in, a seat and a run of units and ayat out        |
| `state.ts`               | the whole halaqa as one value, the reducer, the selectors, `sanitizeState()`    |
| `storage.ts`             | `localStorage`, one key, never throws                                           |
| `labels.ts`              | what the reading screen says: «الصفحة ٢٤»، «الآيات ٥–٩ من سورة الكهف»، buttons |
| `circleLabels.ts`        | what the start screen says about the circle, and the teaching circle            |
| `turnAudio.ts`           | a turn's ayat in a reciter's recording: what to play, whether it can, how long  |
| `player.ts`              | the one audio element, what is playing, and what waits under it                 |
| `position.ts`            | the recitation's place in its recording, read each frame for whoever follows it |
| `countdown.ts`           | the clock of a timed turn, kept outside React                                   |
| `chime.ts`               | the soft tone for a turn that passes on its own (Web Audio)                     |
| `fakeMedia.ts`           | the fake audio element the player's tests and its hooks' tests share            |
| `useHalaqa.ts`           | the reducer, saved after every change                                           |
| `useTurnClock.ts`        | a timed turn's countdown, for the screen                                        |
| `useTimeLeft.ts`         | the time left in a turn, for the small component that shows it                  |
| `useRecitation.ts`       | the one player, the timings, a seated reciter's turn, «استمع», samples          |
| `useAyahListen.ts`       | one ayah heard alone, over whatever plays                                       |
| `usePlaybackPosition.ts` | `position.ts` for React                                                         |

## Members

`config.members` is the circle in reading order, one to eight of them
(`MAX_MEMBERS`):

- a **person** (`{ kind: 'person', name }`), who reads from the page;
- a **reciter** (`{ kind: 'reciter', reciter }`), whose recording recites
  his turn's ayat while everyone follows on the page.

Each has an `id` that stays with them when the circle is reordered: `p1`…`p8`
for people, `r1`…`r8` for reciters, the first free number when added
(`newMember()`). An id is read as digits and a bound (`^[pr]\d+$`, 1 to
`MAX_MEMBERS`, written plainly so «p01» is not a second «p1»), not matched
against a character class, which could not count past nine. A person's
default name comes from that number, not from the seat, so `p2` is «القارئ
الثاني» wherever they sit, and moving them moves them visibly instead of
trading two identical rows. `p1` unnamed is «أنت», spoken to as «دورك». A
reciter is named by his short name, «يتلو الحصري».

`schedule.ts` knows nothing of any of this: a member is a seat number.

## The model

Nothing about the past is stored. A turn reads a run of **units**, one of
four (`Unit`), each with its own numbers through the whole Mushaf:

| Unit    | Numbers | Sizes a turn may take (`TURN_SIZES`) |
| ------- | ------- | ------------------------------------ |
| `page`  | 1–604   | 1, 2, 3                              |
| `ayah`  | 1–6236  | 1, 2, 3, 5, 10                       |
| `rub`   | 1–240   | 1                                    |
| `surah` | 1–114   | 1                                    |

`TURN_SIZES` in `state.ts` is the one table: the start screen offers it and
`sanitizeConfig()` keeps to it, so the two cannot disagree.

A sitting (`Session`) is:

- `turn`, a counter that goes up by «تمّ» and down by «القارئ السابق». The
  member is always `members[turn % members.length]`, so the circle goes
  round in the order it was set up.
- `anchor` (`{ turn, at }`), one turn whose first unit is known. Every other
  turn's first unit is counted from it:
  - **continue** («كلٌّ يُكمل»): `at + (turn - anchor.turn) * size`;
  - **repeat** («كلٌّ يكرّر»): the same, counted in rounds
    (`floor(turn / members)`) instead of turns, so everyone in a round reads
    the same units. A circle of one is always continue (`planOf`).
- `pageInTurn`, which of the turn's pages is open.
- What the circle has finished: `pagesRead` (a page counts when its last
  ayah is read, so a turn of a few ayat adds a page only as it reaches the
  foot of one), `ayatRead`, and `lastRead`, the last ayah finished (0 before
  any). In repeat mode a round's ayat count once, as the round ends.
- `from`, where the sitting's unbroken run of reading begins: where it
  started, or where a jump took it. What was finished since is one stretch,
  `from` to `lastRead`.
- `before`, the last ayah finished before a jump broke that run off; 0 while
  the sitting has read in one run.
- `until`, the ayah at which the goal is reached (exclusive), or null.
- `startedAt`, when `start` was dispatched (the time comes in the action, so
  the reducer stays pure); null for a sitting saved before it was kept.

Whatever the unit, a turn's ayat are a half-open range of ayah numbers
(`rangeOf`, `turnRange`), cut at the end of the Mushaf and at `until`, and
its pages are the pages that range is printed on (`turnPages`). The Madani
print ends every page on a whole ayah, so a turn of pages is whole ayat; a
turn of a few ayat may run onto the next page, and then it has two.

Selectors the screens use: `currentRange`, `currentPages`, `currentPage`,
`placeOf` (the first ayah the circle has not left behind),
`nextTurnOf`, `seatTurn` (the next turn a seat reads, for the circle),
`canStepBack`, `completion` and `nextStart`.

## Moving the circle

`start` anchors turn 0 at the unit holding `config.start`.

**A jump re-anchors the current turn** (`goToAyah`, `goToPage` outside the
turn, `restartMushaf`): the turn now begins on the unit holding the ayah,
with that ayah's page open. The turn number is kept, so the same member
keeps the turn. A jump to or past the goal drops the goal, and the sitting
carries on without one. `withRun` decides what the jump does to the run: a
turn that begins just after `lastRead` reads on unbroken; anywhere else the
run is broken off (`before = lastRead`) and a new one begins here.

**Turning the page** (`nextPage`, `previousPage`) moves within the turn's
pages. The screen asks for nothing more: on the last page «تمّ» passes the
turn, and a swipe stops at the turn's edges. Asked past the end, the reducer
moves the whole circle: a turn of pages shifts by one page and keeps its
length and its open page; any other unit jumps to the next page's first
ayah. It never turns past the goal or page 604.

**«القارئ السابق»** (`previousTurn`) un-counts only the turn the circle
finished last: the one whose ayat end at `lastRead` inside the current run.
Stepping back to any other turn (one before a jump, which was never read)
takes nothing away and moves the circle there, as a jump would. It refuses a
turn that would end before the first unit (`isBeforeStart`).

In repeat mode, a member whose turn in the current round came before the
anchor is shown as `skipped` («لم تُقرأ», or «لم يتلُها» for a sheikh),
not ticked («تمّ», «تلا»): the halaqa jumped here after them. This looks
like a bug and is not.

## Swapping who starts

With `rotate` set to `page` or `surah`, the seat after the one that opened
the last page (or surah) opens the next, so two readers alternating single
ayat do not always find the same one starting each page. It is the one rule
the reader cannot follow from `turn % readers` alone, so the turn counter
skips forward instead: at the first turn that begins on a new page, it jumps
to the next number that belongs to the seat that should start, and the
numbers passed over belong to nobody (`startOf` gives null for them). The
reader is still the turn modulo the circle.

It is worked out in `schedule.ts` from the anchor, never stored: the turns
since the anchor fall into stretches, one per page or surah, and each
stretch's first turn says who starts the next. `turnAfter` and `turnBefore`
step across the skipped numbers, so stepping back returns to exactly the
turn that was read. A jump or a change to the circle starts the alternation
afresh from whoever has the turn.

`sanitizeConfig()` keeps `rotate` only where it means something: continue
mode, two or more members, and a unit smaller than the boundary (`page`
needs turns of ayat; `surah` takes ayat, pages or quarters). Anywhere else it
becomes `none`.

## The goal and the end

`config.goal` is none, the end of the surah, the end of the juz, or the end
of a page. `start` works out `until` from the place chosen (`goalEnd`), so a
quarter that opens in the surah before is still a sitting in the surah
chosen. Turns are cut at `until` as they are at the end of the Mushaf.

`completion(s)` says how a sitting with nothing left ended: `khatm` or
`goal`, null while there is more. The reading screen then shows its card
(`Completion.tsx`): «خُتم المصحف» with «ختمة جديدة من الفاتحة»
(`restartMushaf`, a jump to ayah 1, so it breaks the run), or «بلغتم الغاية»
with «تابعوا», which lets the goal go through `configure` and carries on
from where it stopped. Both offer «إنهاء المجلس» and, where there is one, a
way back.

`end` writes `nextStart(session)` into `config.start` (al-Fatihah after a
khatm), so the next sitting starts where this one stopped. It is reached
only through the close card's «إنهاء».

## The close of a sitting

`summaryOf(session, endedAt)` is what the close card says
(`src/sitting/cardText.ts`): from where to where, how many pages and ayat,
how long (`durationMs`, null without `startedAt`), and who sat
(`members`, each with the name the circle shows). It counts what the circle
finished, the same as `pagesRead`: a turn under way is not counted.

`from` is a `Place | null`. It is given only for one unbroken stretch:
`lastRead > 0`, `before === 0` and `from <= lastRead`. After a jump broke the
run it is null, and the card says only where the circle stopped, «وقفتم
عند …» («وقفتَ عند …» alone), rather than «من الفاتحة إلى الكهف» over pages
nobody read. `to` is null when nothing was finished.

## Changing the circle mid-way

`configure` finds whoever has the turn **by id** in the new list. If they
are still in the circle they keep the turn wherever they now sit; if they
left, it goes to whoever took their seat (or the last seat). If that seat
and the plan (readers, mode, unit, size, rotate) are unchanged, and in
repeat mode the same people sit ahead of them, nothing about the schedule
changes: a rename, a new reciter in another seat, a new goal, a new pace.
Otherwise the turn counter moves to a fresh round, `(round + 1) * members +
seat`, so the modulo names the right member from here on.

In continue mode the new anchor carries on from `placeOf`, in the new unit,
keeping the page open. A reader who keeps the turn, in turns of the same
unit and size, keeps the turn's own ayat: on the second of two pages they
still read those two, not that one and the next. A goal reached and kept
stays reached.

In repeat mode **nobody misses an ayah**. The round keeps its first unit
(converted if the unit changed), not the page open. If the reader who left
sat last, everyone else has read the round, and the circle moves on and
counts it. Otherwise, if anyone now seated ahead of the reader is still to
read the round (moved up, newly added, or the turn grown to ayat they did
not read), it starts over from the first seat. If not, the reader carries on
where they were, and the round is anchored so those ahead keep their marks.
`state.test.ts` has a case for each, in each unit.

## A reciter's turn

`useReciterTurn` starts his recitation when the turn comes to him and stops
it when the turn leaves, however it leaves («تخطَّ», «القارئ السابق», a jump,
a change in the settings). What plays is exactly the turn's ayat
(`rangeRecitation` in `turnAudio.ts`): a whole page from its stretch, part of
a page from the ayat's own times, split at every page and every surah file
so each stretch carries the page it recites.

- The page follows the recitation: as it reaches the next page, `onPage`
  dispatches `goToPage`, which only moves `pageInTurn`. A page reached from
  the same recording plays on without a seek.
- The recitation follows the page: turn back a page mid-turn and it plays
  that page from its start (`seekPage`).
- At the end, `onDone` is the same `finishTurn` that «تمّ» calls, so the
  round's toast and the counts work for a reciter as for anyone.
- The recitation's key holds the turn's `turnKey` (below), so a change to
  the settings that keeps the same reader and the same ayat does not
  restart him.
- **Failures.** His timings or his recording will not load, or nothing
  arrives for 20 seconds (`STALL_MS`): `failed`, and the main button offers
  «تخطَّ» with «تعذّر تشغيل التلاوة» and a retry, which fetches again and
  carries on from where it stopped. A turn holding a surah whose file does
  not fit its timings (`untimed`), or a misplaced ayah, is never played:
  played, it could be the wrong ayat. It shows «تخطَّ» and «لا تتوفّر تلاوة
  هذه الصفحة بصوت الشيخ …», with no retry, since trying again cannot help.

## Timed turns

A reader's turn may be timed by the halaqa's reciter (`config.reciter`):
`turnDuration` over exactly the turn's ayat (pages for a turn of pages,
ayat otherwise, the whole pages standing in where the ayat are not timed),
times the circle's «مهلة الدور» (`allowance`). An untimed page counts as the
longer of its own stretches and his average page, which may give a reader
too long but never cuts one off.

The clock is a `Countdown` (`countdown.ts`) outside React. It ticks four
times a second, and only what shows the time hears the ticks
(`useTimeLeft`); the screen hears of a pause and of the turn running out,
so the Mushaf page is not drawn four times a second. It measures time
between ticks rather than counting ticks, because a background tab slows
timers, and a halaqa over a video call has the call in front.

A clock belongs to one turn, named by its key (`turnKey`, the reciter and
the allowance): a new turn starts a fresh, running clock whether or not the
last was paused, and a change to the circle that keeps the reader and the
ayat keeps the clock where it was. At zero it calls the same `finishTurn`,
and rings the tone if the reader keeps it on.

## Sound

`player.ts` keeps **one** `HTMLAudioElement` for the halaqa. A phone lets a
page start sound only from an element that has already played in answer to
a tap, and a reciter's turn often begins with no tap (a timed turn ending,
another reciter finishing). So every press on the reading screen calls
`wakeSound()`, which primes the player (a tenth of a second of silence, the
first time) and wakes the tone. If a browser refuses all the same, the
status is `blocked`, and any later press on the reading screen plays it.

**Keys.** Everything playing carries a key, and a hook acts only on a state
carrying its own:

- `turn:<turnKey>:<reciter>`, a seated reciter's turn;
- `listen:<turnKey>:<reciter>:<page>:<from>-<to>`, «استمع»;
- `ayah:<n>:<id>`, an ayah heard alone, a new number each time, so stopping
  one never stops the next;
- `sample:<reciter>`, on the samples' own player.

`turnKey` is `${member.id}:${from}-${to}`: who reads and which ayat, not the
turn's number, which a change to the circle moves on while the same reader
carries on with the same ayat. A hook reads a state carrying its key as what
plays, or as `waiting` under an ayah; stopping a waiting key drops it. So a
listen cleaning up never silences the reciter who just started, and a
listen whose timings arrive after its page or turn has moved on is dropped.
`useMarks` and `useFollow` read the same keys to mark what is recited.
Recordings stream from QuranicAudio and are never cached.

**«استمع»** recites what the reader is about to read on the open page: the
page in a turn of pages, the turn's ayat on it otherwise, once or as many
times as `prefs.listenRepeat` says. It stops when the turn or the page
changes. On ayat its sheikh's file does not fit, it says so and offers
«شيخ آخر» (the listener sheet) instead of a retry.

**An ayah alone.** `useAyahListen` plays on the main player with `over`, not
on a second player, since a phone plays only the element a tap unlocked.
What was playing waits, whole (`waiting`), and carries on from the same
place when the ayah ends or is stopped: reciting if it was, paused if
paused. While it waits, a reciter's turn says paused and keeps its time
left; its button ends the ayah and carries on; a page turned meanwhile is
sought when the turn comes back. An ayah that fails says so and leaves what
waits as it was. It belongs to a scope (the turn and the page) and stops
when that changes or the screen closes.

**One pause.** On a reader's timed turn the pause stops the clock and
whatever recites over it («استمع» or the ayah) together, and resuming
brings back only what it stopped. On a reciter's turn it pauses him. Space
does the same, reaching an ayah heard alone first (`spaceTarget`).

**Hush.** The close card calls `actions.hush()`: it **stops** the ayah heard
alone (its bar goes with the close, and an ayah left paused with no bar
would be found by Space), which puts back what waited under it, and then
pauses whatever plays and the timed clock. Nothing resumes by itself if the
circle goes back to reading. One gap: a reciter whose timings are still
downloading starts when they arrive.

**Position.** `position()` and `usePlaybackPosition` give the recording's
own time, which compares with the timings as they are at any speed. It is
read once a frame only while someone follows it and something plays, and
is null otherwise; the element's own updates, four a second, are too coarse
for a word.

**Samples.** The reciter list plays a reciter's al-Fatiha on a second
`Player` (`useSample`), only ever started by a tap, kept off the lock
screen, and at the reciter's own speed so paces compare. It pauses the
halaqa's recitation while it plays and carries it on when it stops, and it
stops if that recitation starts again some other way: one voice at a time.
One that cannot be heard says so on his row.

**Speed.** `player.setRate()` sets both the element's rate and its default
(a new source resets the rate to the default), and the timer that stops a
stretch on its last word divides by it. A reciter's time left is shown in
clock time, not recording time.

**The tone.** A turn that passes on its own rings `chime()` if the reader
keeps it on. It is Web Audio, woken by the same taps that prime the player,
and never touches the recitations' element.

**Stretches.** Two stretches of the same file are played through without a
seek when the next starts within three seconds after the last ended, or
overlaps it by less than ten (one reciter's data has a page beginning 5.6
seconds before the last one ends, and seeking back would repeat it). A
stretch that starts no later than the one before is a repeat and is always
sought, however short. A stretch stops on its last word: position updates
come about four times a second, so a timer set from the current position
ends it on time. Pauses the player did not make (a headset unplugged, the
lock screen) are noticed, and the lock screen keeps a failed recitation as
paused.

## Saved state

`config` is the circle as last set up. The start screen saves every choice
as it is made (`draft`), not only on «ابدأ المجلس», so a refresh or the next
visit finds it as it was left. With nothing saved it is «أنت» alone, in the
system's light or dark theme (`useHalaqa`, `systemTheme()`).

`sanitizeState()` is the only way stored data comes back in. It repairs
rather than rejects:

- prefs: each one of its known values, or its default (an unknown theme
  becomes green);
- members: a known kind, a valid unique id of its kind (else the first free
  one), a name cut to 40 characters, a reciter that exists; at most eight.
  A halaqa saved before reciters could sit (`readers`, a list of names)
  becomes people in the same order;
- the plan: a unit and a size from `TURN_SIZES`; `rotate` only where it
  means something; a goal of a known kind (a page from 1 to 604). A halaqa
  saved before units (`pagesPerTurn`, `startPage`, `anchor.page`) is read
  as turns of pages; `start` is an ayah from 1 to 6236;
- the session: `anchor.turn` no later than `turn`, `anchor.at` from 1 to
  one past the unit's last, `pageInTurn` within the turn, `until` from 2 to
  one past the last ayah or null, `startedAt` a time or null. `lastRead` is
  derived for a sitting saved before it was kept (`lastBefore`), and
  `before` is clamped to `lastRead`, or derived for an older save
  (`runBefore`).

`storage.ts` keeps it under one key, `majlis-noor:v1`; see the root
AGENTS.md for why that key is a contract.

## Tests

| File                          | What it holds                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `schedule.test.ts`            | continue and repeat, every unit, cuts at an end, swapping who starts                                                            |
| `state.test.ts`               | the reducer in every unit: jumps and runs, «القارئ السابق», changing the circle, the goal, ending, the summary, the saved shapes |
| `storage.test.ts`             | the saved halaqa, a first visit                                                                                                 |
| `labels.test.ts`              | every sentence of the reading screen, and what a screen reader hears                                                            |
| `circleLabels.test.ts`        | the teaching circle, the summary row, where the sitting starts, the card for a sitting left open                                |
| `turnAudio.test.ts`           | what a turn of pages and a turn of ayat play, and for how long                                                                  |
| `countdown.test.ts`           | the clock, on fake time                                                                                                         |
| `player.test.ts`              | the player on a fake element: queues, seeks, failures, playing over, the lock screen                                            |
| `position.test.ts`            | the position feed, on fake frames                                                                                               |
| `useRecitation.test.ts`       | samples, a reciter's turn, «استمع»                                                                                              |
| `useAyahListen.test.ts`       | an ayah alone and what waits under it                                                                                           |
| `usePlaybackPosition.test.ts` | the position for React                                                                                                          |

Whenever `State` changes shape, add to `state.test.ts` a round trip, a
hostile value and the old shape.
