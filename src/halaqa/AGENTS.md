# src/halaqa

Who reads which page, and everything that changes it. No React here except
the files named `use*.ts`.

| File               | What it is                                                     |
| ------------------ | -------------------------------------------------------------- |
| `schedule.ts`      | pure functions: a turn number in, a seat and pages out         |
| `state.ts`         | the whole halaqa as one value, the reducer, `sanitizeState()`  |
| `storage.ts`       | `localStorage`, one key, never throws                          |
| `labels.ts`        | «الصفحة ٢٤»، «الصفحتان ٢٤ و٢٥»، «ص ٢٤»                           |
| `player.ts`        | the one audio element, and the recitation playing on it        |
| `useHalaqa.ts`     | the reducer, saved after every change                          |
| `useTurnClock.ts`  | the countdown of a reciter-timed turn                          |
| `useRecitation.ts` | a seated reciter's turn, «استمع», and the timings both need     |

## Members

`config.members` is the circle in reading order, one to four of them:

- a **person** (`{ kind: 'person', name }`), who reads from the page;
- a **reciter** (`{ kind: 'reciter', reciter }`), whose recording recites
  his turn's pages while everyone follows on the page.

Each has an `id` that stays with them when the circle is reordered: `p1`…`p4`
for people, `r1`…`r4` for reciters, the first free number when added
(`newMember()`). A person's default name comes from that number, not from
the seat, so `p2` is «القارئ الثاني» wherever they sit, and moving them moves
them visibly instead of trading two identical rows. `p1` unnamed is «أنت»,
spoken to as «دورك». A reciter is named by his short name, «يتلو الحصري».

`schedule.ts` knows nothing of any of this: a member is a seat number.

## The model

Nothing about the past is stored. A halaqa is:

- `turn`, a counter that only ever goes up by «تمّ» and down by «القارئ
  السابق». The member is always `members[turn % members.length]`, so the
  circle goes round in the order it was set up.
- `anchor`, one turn whose first page is known. Every other turn's pages are
  counted from it:
  - continue: `anchor.page + (turn - anchor.turn) * pagesPerTurn`
  - repeat: the same, counted in rounds (`floor(turn / members)`) instead of
    turns, so everyone in a round reads the same pages.
- `pageInTurn`, which of a multi-page turn's pages is open.
- `pagesRead`, the one number about the sitting that is shown.

Starting anchors turn 0 at the chosen page. **Jumping re-anchors the current
turn** at its new page, and so does stepping one page past the end of a turn
(the whole circle moves one page on) and changing the circle in the
settings. Re-anchoring keeps the turn number, so the same member keeps the
turn and nobody loses their place.

In repeat mode, a member whose turn in the current round came before the
anchor is shown as `skipped`, not ticked: the halaqa jumped here after they
read. This looks like a bug and is not.

## Changing the circle mid-way

`configure` finds whoever has the turn **by id** in the new list. If they
are still in the circle they keep the turn wherever they now sit; if they
left, it goes to whoever took their seat (or the last seat). If that seat
and the plan (size, mode, pages per turn) are unchanged, nothing about the
schedule changes: a rename, a new reciter in a seat, a new pace. Otherwise
the turn counter moves to a fresh round, `(round + 1) * members + seat`, and
is re-anchored at the page being read, so the modulo names the right member
from here on and the circle goes round in its new order.

In repeat mode **nobody misses a page**. The round keeps its first page
(not the page open, which in a turn of two pages may be its second). If the
reader who left sat last, everyone else has read the round's pages and the
circle moves on to the next. Otherwise, if anyone now seated ahead of the
reader is still to read them (moved up, newly added, or the turn grown to a
page they did not read), the pages start over from the first seat. If not,
the reader carries on on the same page, and the round is anchored so those
ahead keep their ticks (or their «لم يقرأها»). `state.test.ts` has a case
for each.

## A reciter's turn

`useReciterTurn` starts his recitation when the turn comes to him and stops
it when the turn leaves, however it leaves («تخطَّ», «القارئ السابق», a jump,
a change in the settings). The queue is the turn's pages
(`recitationOf()`): one stretch of the surah recording per page, or two
where a page holds the end of one surah and the start of the next.

- The page follows the recitation: as it reaches the next page, `onPage`
  dispatches `goToPage`, which only moves `pageInTurn`. A page reached from
  the same recording plays on without a seek.
- The recitation follows the page: turn back a page mid-turn and it plays
  that page from its start (`seekPage`). The hook tells the two apart by
  comparing the page on screen with the page the player says it is on.
- At the end of the last page, `onDone` is the same `finishTurn` that «تمّ»
  calls, so the round toast and `pagesRead` work for a reciter as for anyone.
- His turn needs no clock: its length is his recitation. A reader's timed
  turn is still timed by the halaqa's own reciter (`config.reciter`).

## Sound

`player.ts` keeps **one** `HTMLAudioElement` for the whole app. A phone lets a
page start sound only from an element that has already played in answer to
a tap, and a reciter's turn often begins with no tap (a timed turn ending,
another reciter finishing). So every press on the reading screen calls
`player.prime()`, which plays a tenth of a second of silence the first time.
If a browser refuses all the same, the status is `blocked`, the reciter's
button says «استمع إلى …», and that tap plays.

Everything playing carries a key (`turn:…` or `listen:…`). A hook only
reads a state carrying its own key and only stops its own, so a listen
cleaning up never silences the reciter who just started, and a listen whose
timings arrive after its page or turn has moved on is dropped. Recordings
stream from QuranicAudio and are never cached by the service worker.

**One pause.** On a reader's timed turn the pause stops the clock and the
«استمع» recitation together, and resuming brings back what it stopped. On a
reciter's turn it pauses him. Space does the same.

**Samples.** The reciter list plays a reciter's al-Fatiha on a second
`Player` (`useSample`), only ever started by a tap, kept off the lock
screen, and at the reciter's own speed so paces compare. It pauses the
halaqa's recitation while it plays and carries it on when it stops, and it
stops if that recitation starts again some other way: one voice at a time.

**Speed.** `player.setRate()` sets both the element's rate and its default
(a new source resets the rate to the default), and the timer that stops a
stretch on its last word divides by it. A reciter's time left is shown in
clock time, not recording time.

**The tone.** A turn that passes on its own, a timed one running out or a
reciter finishing, rings `chime()` if the reader keeps it on. It is Web
Audio, woken by the same taps that prime the player (`wakeSound()`), and
never touches the recitations' element.

A recording's page stretches are played through without a seek when the
next starts within three seconds of where the last ended, or before it: one
reciter's data has a page beginning 5.6 seconds before the last one ends,
and seeking back would repeat it.

A stretch stops on its last word: position updates come about four times a
second, so a timer set from the current position ends it on time. Pauses the
player did not make (a headset unplugged, the lock screen) are noticed.

## The end of the Mushaf

`pagesOf()` cuts a turn short at page 604, and a turn with no pages left
means the Mushaf is complete (`isComplete()`); the reading screen shows the
khatm card instead of a page, and «ختمة جديدة من الفاتحة» re-anchors the
current turn at page 1. «القارئ السابق» refuses a turn that would begin before
page 1 (`isBeforeStart()`).

## Timed turns

`useTurnClock` belongs to one turn at a time (`turnKey`): a new turn starts a
fresh, running clock whether or not the last one was paused. It measures time
between ticks rather than counting ticks, because a background tab slows
timers, and a halaqa over a video call has the call in front. When it reaches
zero it calls `onExpire`, which is the same `finishTurn` the button calls.

The turn's length is the reciter's duration over exactly the turn's pages
(`pagesDuration()`), so a turn of two pages is timed by two pages, and a
turn cut short at page 604 by what is left.

## Saved state

`config` is the circle as last set up. The start screen saves every choice
as it is made (`draft`), not only on «ابدأ الحلقة», so a refresh or the next
visit finds it as it was left. With nothing saved it is «أنت» alone.

`sanitizeState()` is the only way stored data comes back in. It repairs
rather than rejects: an unknown theme becomes green, a page out of range
becomes 1, an anchor after the turn becomes turn 0, a duplicate or malformed
member id is replaced, an unknown reciter becomes the default one, and a
halaqa saved before reciters could sit (`readers`, a list of names) becomes
people in the same order. `state.test.ts` has a round trip, a hostile value
and the old shape; add to it whenever `State` changes shape.
