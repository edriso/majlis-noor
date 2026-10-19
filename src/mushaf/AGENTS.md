# src/mushaf

Drawing one page of the Madani Mushaf, and what a reader does on it.

| File              | What it is                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| `MushafPage.tsx`  | the page: running head, 15 lines, folio; marks, taps and copying           |
| `usePage.ts`      | loads a page's data and font together, retries, and prefetches             |
| `fonts.ts`        | one `FontFace` per page, from Quran.com's font host, with retries          |
| `words.ts`        | which word of which ayah each glyph draws (`pageWords`), and its real text |
| `useFollow.ts`    | the ayah or word being recited, from the player's position and the timings |
| `AyahBar.tsx`     | one ayah chosen: hear it once, three times, from a word; copy it           |
| `MemoryCover.tsx` | the cover over the page in a review from memory                            |

The styles are `src/styles/mushaf.css` (the page) and `src/styles/marks.css`
(the marks, the ayah bar, the cover). The room the page sits in, and the
spread of two, are the reading screen's: `src/screens/reading/MushafView.tsx`
and `src/styles/stage.css`.

## Why glyphs and not text

Each of the 604 pages has a font of its own, made by the King Fahd Complex, in
which every word of that page is a single glyph drawn as it was printed. The
page data stores each word as its glyph code, so a line is a row of glyphs.
That is the only way a browser shows the Mushaf the way a reader knows it:
the same words on the same lines, the same ligatures and marks. Text in an
Arabic font, however good, reflows and breaks lines in other places.

The glyph codes are private-use characters, meaningless to a screen reader or
to any other font. So every line also carries its Uthmani text (`x`), before
the glyphs, hidden from sight in glyph mode and read by screen readers; each
glyph is `aria-hidden`. If a page's font cannot load, the same text becomes
the page, set in Amiri Quran (self-hosted, never subset;
`src/styles/fonts.test.ts` checks it draws every character of the 604 pages)
on the same fifteen lines. A page always reads.

## Layout rules

- Every line is the same height and justified edge to edge (`space-between`),
  as the print is. A surah header or a basmala takes exactly one line's room.
- Pages 1 and 2 are the opening spread: eight lines, centred on the page.
- Everything is sized in `cqi`, a share of the page's own width, so the page is
  one fixed shape at any size. Its height over its width is `--page-height`
  in `tokens.css`, and `mushaf.css` itemises what it adds up from. Change a
  size inside the page and update both, or the layout around it will be wrong.
- The running head and the folio are not the Mushaf, and follow the reader's
  text size: `--page-meta`, `clamp(3.5cqi, 0.8125rem, 5cqi)`. Their boxes stay
  in `cqi`, so the page keeps its shape.
- The basmala is al-Fatihah's first four glyphs from page 1's font
  (`BASMALA_GLYPHS`), so it is the Mushaf's own basmala everywhere. The test
  checks those codes against page 1.
- The surah header is drawn here (a framed cartouche with the name in Amiri),
  not taken from a font. Six names are spelt as a modern list spells them,
  not as the API gives them (see the root AGENTS.md); the Mushaf's text is
  never touched.
- In a spread, the page outside the turn is drawn in `--ink-soft` on the same
  paper (stage.css), so the turn's page is the one in full black without the
  other looking switched off. A grey wash read as disabled.

## Loading

A page's data is a JSON file in `public/pages/`, fetched under
`import.meta.env.BASE_URL` (`loadPage` in `src/data/mushaf.ts`), loaded once
and kept. `usePage` has three states:

- **loading**: a skeleton until both the page's JSON and its font are in, so
  codes never flash as boxes. A page already fetched ahead with its font is
  drawn in the same frame.
- **error**: the data could not load (offline, and never opened on this
  device). The page says «هذه الصفحة غير محفوظة على جهازك بعد، وتحتاج إلى
  اتصال» with «أعد المحاولة», in a polite live paragraph rather than a
  status: the reading screen's one status is whose turn it is.
- **ready**, in glyphs or in text. A font is tried three times (again after
  0.4 s and 1.2 s); once it has failed every try, for the next minute each
  font is tried once, since the host is down and the readable text should
  not wait; offline, once. The note «تعذّر تحميل خطّ الصفحة، والنص معروض بخطّ
  بديل» and its retry take the folio's place, and the page is a little
  taller (`--page-height: 1.8` on `.mushaf-page[data-fallback]`). A font
  that arrives turns the page back to glyphs.

Once a page is drawn it fetches the next turn's pages and the pages either
side, data and fonts, which is why «تمّ» is instant. Fonts are cached by the
browser for a year and by the service worker for good.

## The fallback text never clips

The line box is shorter than Amiri Quran's marks (it rises 1.82em above its
baseline), and clipping to it cut every kasra and tail below the line. So
nothing on a text line clips, and the row has room for the tallest marks. A
line too wide for the page is drawn smaller instead, by a `--fit` measured
from hidden, never-shrunk copies of the lines (`.mushaf-probes`, watched by a
`ResizeObserver`, since a font arriving for any letter changes their width).
`scripts/check-layout.ts` blocks the font host and fails on any clipped line.

## Marks

The turn's ayat underlined (only where the turn covers part of a page), the
ayah or word being recited on a wash, and an ayah chosen with a tap on a
solid tint. **None may move a glyph.** Each mark is an absolutely placed
pseudo-element behind its word, never padding, margin or border, so a page
with marks is the same page as one without, glyph for glyph.

Every mark lies in **one layer** under every glyph of the page:
`.mushaf-lines { isolation: isolate }`, and the marks at negative `z-index`.
Glyph ink overhangs its box by up to 0.4em into the next word (the ر of
«فَٱنظُرْ» on page 378), so **a word span must never be a stacking context**:
give one `opacity`, a `transform` or a `z-index` and its neighbour's mark is
drawn over that tail. The tints are solid, mixed into `--paper`: two words'
pills overlap, and a see-through tint doubled into a seam between them.

`useFollow` turns the player's position into the ayah, or the word, recited,
150 ms ahead (`LEAD_MS`; timings are good to about 300 ms, and a mark a
moment early reads better than one late). In a pause it keeps the ayah just
recited. By the word only where every word of the ayah is timed; elsewhere
the ayah whole. `prefs.follow` chooses. A page drawn from its text has no
marks.

`MushafPage` is `memo` with a by-value compare (`sameProps`), and each line
redraws only when a mark on its own ayat changes, since the word recited
moves several times a second. **Add a prop and add it to `sameProps`.**

## Taps, markers and the ayah bar

A tap on a word chooses its ayah, through one click handler on the lines. A
finger that moved is a swipe, and a click that leaves words selected is a
reader choosing words to copy; neither is a tap. A mouse drag that selects
does not swipe either.

Each end-of-ayah marker is a `<button>` named «الآية ٧ من سورة آل عمران —
استمع إليها», so the keyboard and screen readers reach every ayah. It is the
documented exception to 44px targets (WCAG 2.5.8 allows inline targets).
It must lay out exactly as the glyph did when it was a span, so it unsets
everything a button brings (`all: unset`). With the buttons and every mark
on, pages 1, 50, 77, 293, 589 and 604 were checked in Chrome to be pixel for
pixel the same in all four themes; no test does this, so check again if you
touch them. The markers add 10 to 27 Tab stops a page.

The ayah bar (`AyahBar`) docks at the foot of the room, or at its top where
the ayah is low on the page. It offers «استمع», «كرّر ٣ مرات», «من هذه
الكلمة» (from the word tapped, where its timing is known) and «انسخ الآية»,
which copies «… ﴿١٤﴾ [النمل: ١٤]»; if the clipboard refuses it says how to
copy by hand. Escape, «إغلاق» or a tap elsewhere closes it, and the focus
goes back to whatever had it. The reading screen's Escape waits for it: it
listens on the document, which hears the key before the window does.

## Copying

Left to itself the browser would copy glyph codes, which paste as boxes. A
copy handler on the document maps every glyph the selection takes in to its
word's real text and puts that on the clipboard. Each word's text comes from
its line's `x`, split back into entries (`entryTexts` in `words.ts`): a pause
mark (ۚ ۖ ۗ, the prostration's ۩) goes with the word before it, a hizb
quarter's ۞ with the word after, three words written in two parts are joined,
and the comparison is NFC-composed. A marker copies as ﴿١٤﴾.
`words.test.ts` holds every line of the Mushaf to its entries.

## From memory

`MemoryCover` covers the page, or both pages of a spread, on a person's turn
when the circle reviews from memory. It says where the turn begins («سورة
الملك · من الآية ١٣») and has one outline button to uncover it («اكشف
الصفحة», «اكشف الصفحتين» in a spread). Under it the page is drawn but
`inert`, so it cannot be seen, reached or read aloud. A new turn covers it
again.

## Forced colours

The system drops tints and lays a plate behind text, which would hide the
underline and the outline. So word spans take `forced-color-adjust: none`
and draw themselves in `CanvasText`; the turn uses `Highlight`, the
recitation `Mark` with a ring, and a chosen ayah a `Highlight` ring, never a
background alone.
