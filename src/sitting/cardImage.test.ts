import { describe, expect, it } from 'vitest';
import { ayahIndex } from '@/data/mushaf';
import {
  defaultConfig,
  initialState,
  reduce,
  summaryOf,
  type Action,
  type Member,
} from '@/halaqa/state';
import type { CardDesign } from '@/halaqa/state';
import {
  ARCH,
  archHalfWidth,
  balancedLines,
  clear,
  DESIGNS,
  facesOf,
  FAMILIES,
  layoutCard,
  SAFE,
  wrapLines,
  type Measure,
  type Op,
  type TextOp,
} from './cardImage';
import { cardText, type CardText } from './cardText';

/* A ruler with no browser: every character half as wide as the type is
   tall, which is about what Plex's Arabic averages. */
const fake: Measure = (text, font) =>
  text.length * Number(/([\d.]+)px/.exec(font)![1]) * 0.5;

const chars = (s: string) => s.length;

const at = (h: number, m: number) => new Date(2026, 9, 18, h, m).getTime();

function card(members: Member[], turns = 4): CardText {
  const finish: Action[] = Array.from({ length: turns }, () => ({
    type: 'finishTurn',
  }));
  const state = finish.reduce(
    reduce,
    reduce(initialState, {
      type: 'start',
      config: { ...defaultConfig, members, start: ayahIndex(3, 1) },
      at: at(19, 0),
    }),
  );
  return cardText(summaryOf(state.session!, at(19, 25)), at(19, 25));
}

const circle: Member[] = [
  { id: 'p1', kind: 'person', name: '' },
  { id: 'p2', kind: 'person', name: 'فاطمة' },
  { id: 'r1', kind: 'reciter', reciter: 'husary' },
];

const texts = (ops: Op[]) =>
  ops.filter((op): op is TextOp => op.kind === 'text');

/** A line as it reads, its lead and the words after it. */
const said = (op: TextOp) => `${op.lead?.text ?? ''}${op.text}`;

describe('breaking a line', () => {
  it('breaks between words, never inside one', () => {
    expect(wrapLines('أشهد أن لا إله إلا أنت', 11, chars)).toEqual([
      'أشهد أن لا',
      'إله إلا أنت',
    ]);
    expect(wrapLines('سبحانك', 3, chars)).toEqual(['سبحانك']);
    expect(wrapLines('  ', 10, chars)).toEqual([]);
  });

  it('keeps every line within the width when the words allow', () => {
    const text = 'سبحانك اللهم وبحمدك أشهد أن لا إله إلا أنت أستغفرك وأتوب إليك';
    for (const width of [12, 20, 30, 45]) {
      const lines = wrapLines(text, width, chars);
      expect(lines.join(' ')).toBe(text);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
    }
  });

  it('shares the words out evenly when balanced', () => {
    const text = 'أ ب ت ث ج ح خ د ذ';
    // Greedy leaves one letter alone: «أ ب ت ث ج ح خ د» and «ذ».
    expect(wrapLines(text, 16, chars)).toHaveLength(2);
    expect(wrapLines(text, 16, chars)[1]).toBe('ذ');
    const even = balancedLines(text, 16, chars);
    expect(even).toHaveLength(2);
    expect(even.join(' ')).toBe(text);
    expect(Math.abs(even[0].length - even[1].length)).toBeLessThanOrEqual(2);
    expect(balancedLines('أ ب', 16, chars)).toEqual(['أ ب']);
  });

  it('never breaks at a no-break space', () => {
    const glued = 'من سورة الإسراء، الآية\u00a0١٠٥ (الصفحة\u00a0٢٩٣)';
    for (const width of [10, 14, 20, 30])
      for (const line of wrapLines(glued, width, chars)) {
        expect(line.startsWith('٢٩٣')).toBe(false);
        expect(line.startsWith('١٠٥')).toBe(false);
      }
    expect(wrapLines(glued, 16, chars).at(-1)).toBe('(الصفحة\u00a0٢٩٣)');
  });
});

const long = 'عبد الرحمن بن عبد العزيز الفلاني';
const eight: Member[] = [
  ...Array.from(
    { length: 6 },
    (_, i): Member => ({
      id: `p${i + 1}`,
      kind: 'person',
      name: `${long} ${i + 1}`,
    }),
  ),
  { id: 'r1', kind: 'reciter', reciter: 'husary-muallim' },
  { id: 'r2', kind: 'reciter', reciter: 'abdulbasit' },
];

const designs: CardDesign[] = ['ornate', 'status', 'simple'];

/** The sittings every design must hold: the brief's, one that read
    nothing, and the longest circle there can be. */
const sittings = {
  brief: () => card(circle),
  nothing: () => card(circle, 0),
  eight: () => card(eight),
};

/** How far an op reaches up and down, and right and left. */
function extent(op: Op) {
  if (op.kind === 'text')
    return {
      top: op.y - op.height / 2,
      bottom: op.y + op.height / 2,
      right: op.x,
      left: op.x - op.width,
    };
  if (op.kind === 'rule')
    return op.style === 'diamond'
      ? {
          top: op.y - 18,
          bottom: op.y + 18,
          right: op.x + op.width / 2,
          left: op.x - op.width / 2,
        }
      : { top: op.y - 2, bottom: op.y + 2, right: op.x, left: op.x - op.width };
  return {
    top: op.y - op.mark.size / 2,
    bottom: op.y + op.mark.size / 2,
    right: op.mark.x + op.mark.size,
    left: op.name.x - op.name.width,
  };
}

describe('laying out the card', () => {
  it('draws every line of the card, in order', () => {
    const text = card(circle);
    const { ops, scale } = layoutCard(text, fake);
    expect(scale).toBe(1);
    expect(texts(ops).map(said)).toEqual([
      'ختام المجلس',
      ...text.dates,
      text.time,
      ...text.read,
      text.amount,
      // «الشيخ الحصري» held together by a no-break space.
      'الحاضرون: أنت وفاطمة والشيخ\u00a0الحصري',
      ...text.supplication,
    ]);
    expect(ops.filter((op) => op.kind === 'rule')).toHaveLength(2);
    expect(ops.at(-1)).toMatchObject({
      kind: 'brand',
      name: { text: 'مجلس نور' },
    });
  });

  it('says the same in every design', () => {
    const text = card(circle);
    const words = (d: CardDesign) =>
      texts(layoutCard(text, fake, d).ops)
        .map(said)
        .join(' ')
        .replaceAll(' · ', ' ');
    for (const d of designs) {
      expect(words(d)).toBe(words('ornate'));
      expect(layoutCard(text, fake, d).ops.at(-1)!.kind).toBe('brand');
    }
    // The square puts the Gregorian date and the time on one line.
    expect(texts(layoutCard(text, fake, 'simple').ops).map(said)).toContain(
      `${text.dates[1]} · ${text.time}`,
    );
  });

  it('draws each design at its own size', () => {
    const text = card(circle);
    const size = (d: CardDesign) => {
      const { width, height } = layoutCard(text, fake, d);
      return [width, height];
    };
    expect(size('ornate')).toEqual([1080, 1350]);
    expect(size('status')).toEqual([1080, 1920]);
    expect(size('simple')).toEqual([1080, 1080]);
  });

  it('sets the title and name in Reem Kufi, the supplication in Amiri', () => {
    const { ops } = layoutCard(card(circle), fake);
    const [title] = texts(ops);
    expect(title.font).toBe(`600 92px ${FAMILIES.brand}`);
    expect(title.ink).toBe('gold');
    const last = texts(ops).at(-1)!;
    expect(last.font).toContain(FAMILIES.naskh);
    expect(last.ink).toBe('muted');
    const present = texts(ops).find((op) => op.lead)!;
    expect(present.lead).toMatchObject({ text: 'الحاضرون: ', ink: 'muted' });
    expect(present.ink).toBe('fg');
  });

  it('centres the framed and the tall card, and sets the square from the right', () => {
    const text = card(circle);
    for (const d of ['ornate', 'status'] as const)
      for (const op of texts(layoutCard(text, fake, d).ops))
        expect(op.x - op.width / 2).toBeCloseTo(540);
    for (const op of texts(layoutCard(text, fake, 'simple').ops))
      expect(op.x).toBe(DESIGNS.simple.content.right);
  });

  for (const d of designs)
    for (const [name, make] of Object.entries(sittings))
      it(`keeps every line of ${name} inside the ${d} card`, () => {
        const text = make();
        const { ops, height } = layoutCard(text, fake, d);
        const box = DESIGNS[d].content;
        for (const op of texts(ops)) {
          const e = extent(op);
          expect(e.right).toBeLessThanOrEqual(box.right + 0.01);
          expect(e.left).toBeGreaterThanOrEqual(box.left - 0.01);
          expect(e.top).toBeGreaterThanOrEqual(box.top - 0.01);
          expect(e.bottom).toBeLessThanOrEqual(box.bottom + 0.01);
        }
        // The name sits under the words, on the page.
        const brand = extent(ops.at(-1)!);
        expect(brand.top).toBeGreaterThan(box.bottom);
        expect(brand.bottom).toBeLessThan(height - 60);
        // Every name is drawn, the lead on the first line only.
        if (text.present) {
          const flat = (t: string) => t.replaceAll(/\s+/g, ' ');
          const drawn = flat(texts(ops).map(said).join(' '));
          const { label, names } = text.present;
          expect(drawn).toContain(flat(`${label}: ${names}`));
          expect(texts(ops).filter((op) => op.lead)).toHaveLength(1);
        }
      });

  it('keeps the tall card clear of what a status or a story lays over it', () => {
    for (const make of Object.values(sittings)) {
      const { ops } = layoutCard(make(), fake, 'status');
      for (const op of ops) {
        const e = extent(op);
        expect(e.top).toBeGreaterThanOrEqual(SAFE.top);
        expect(e.bottom).toBeLessThanOrEqual(SAFE.bottom);
      }
    }
  });

  it('keeps the tall card’s words under its arch', () => {
    for (const make of Object.values(sittings)) {
      const { ops } = layoutCard(make(), fake, 'status');
      for (const op of texts(ops)) {
        const e = extent(op);
        // Measured where the arch is narrowest for the line, its top.
        const half = archHalfWidth(e.top);
        expect(e.right - 540).toBeLessThanOrEqual(half - 24);
        expect(540 - e.left).toBeLessThanOrEqual(half - 24);
      }
    }
    expect(archHalfWidth(ARCH.apex)).toBe(0);
    expect(archHalfWidth(1200)).toBe((ARCH.right - ARCH.left) / 2);
  });

  it('sits a short card in the middle of its room', () => {
    for (const d of designs) {
      const { ops } = layoutCard(card(circle, 0), fake, d);
      const lines = texts(ops);
      const box = DESIGNS[d].content;
      const top = extent(lines[0]).top - box.top;
      const bottom = box.bottom - extent(lines.at(-1)!).bottom;
      expect(Math.abs(top - bottom)).toBeLessThan(2);
      expect(lines.map(said)).toContain('لم تكتمل قراءة بعد');
    }
  });

  it('shrinks the type for the longest circle until it fits', () => {
    expect(layoutCard(card(eight), fake, 'ornate').scale).toBeLessThan(1);
    expect(layoutCard(card(eight), fake, 'simple').scale).toBeLessThan(1);
  });
});

describe('the fonts a picture needs', () => {
  it('names each face once, with all the text drawn in it', () => {
    const { ops } = layoutCard(card(circle), fake);
    const faces = facesOf(ops);
    expect([...faces.keys()].sort()).toEqual(
      [
        `600 16px ${FAMILIES.brand}`,
        `400 16px ${FAMILIES.ui}`,
        `500 16px ${FAMILIES.ui}`,
        `600 16px ${FAMILIES.ui}`,
        `400 16px ${FAMILIES.naskh}`,
      ].sort(),
    );
    expect(faces.get(`600 16px ${FAMILIES.brand}`)).toBe('ختام المجلسمجلس نور');
  });
});

describe('the light over the ground', () => {
  it('fades to its own colour, not to black', () => {
    expect(clear('rgba(255, 252, 244, 0.4)')).toBe('rgba(255, 252, 244, 0)');
    expect(clear('#fbf6e8')).toBe('#fbf6e800');
  });
});
