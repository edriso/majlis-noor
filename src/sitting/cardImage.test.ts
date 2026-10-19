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
import {
  balancedLines,
  CARD_HEIGHT,
  clear,
  CONTENT,
  facesOf,
  FAMILIES,
  FRAME,
  layoutCard,
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
});

describe('laying out the card', () => {
  it('draws every line of the card, in order', () => {
    const text = card(circle);
    const { ops, scale } = layoutCard(text, fake);
    expect(scale).toBe(1);
    expect(texts(ops).map(said)).toEqual([
      'ختام المجلس',
      ...text.dates,
      ...text.read,
      text.amount,
      'الحاضرون: أنت وفاطمة والشيخ الحصري',
      ...text.supplication,
    ]);
    expect(ops.filter((op) => op.kind === 'rule')).toHaveLength(2);
    expect(ops.at(-1)).toMatchObject({
      kind: 'brand',
      name: { text: 'مجلس نور' },
    });
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

  it('centres every line and keeps it inside the frame', () => {
    const { ops } = layoutCard(card(circle), fake);
    for (const op of texts(ops)) {
      expect(op.x - op.width / 2).toBeCloseTo(540);
      expect(op.x).toBeLessThanOrEqual(CONTENT.right);
      expect(op.x - op.width).toBeGreaterThanOrEqual(CONTENT.left);
      expect(op.y).toBeGreaterThan(CONTENT.top);
      expect(op.y).toBeLessThan(CONTENT.bottom);
    }
    const brand = ops.at(-1)!;
    expect(brand.y).toBeGreaterThan(CONTENT.bottom);
    expect(brand.y).toBeLessThan(CARD_HEIGHT - FRAME.inner);
  });

  it('sits a short card in the middle of its frame', () => {
    const { ops } = layoutCard(card(circle, 0), fake);
    const lines = texts(ops);
    const top = lines[0].y - CONTENT.top;
    const bottom = CONTENT.bottom - lines.at(-1)!.y;
    expect(Math.abs(top - bottom)).toBeLessThan(60);
    expect(lines.map(said)).toContain('لم تكتمل قراءة بعد');
  });

  it('shrinks the type for the longest circle until it fits', () => {
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
    const text = card(eight);
    const { ops, scale } = layoutCard(text, fake);
    expect(scale).toBeLessThan(1);
    const lines = texts(ops);
    for (const op of lines) {
      expect(op.x).toBeLessThanOrEqual(CONTENT.right);
      expect(op.x - op.width).toBeGreaterThanOrEqual(CONTENT.left);
      expect(op.y).toBeLessThan(CONTENT.bottom);
    }
    // Every name is drawn, the lead on the first line only.
    const names = lines
      .filter((op) => op.font.includes(FAMILIES.ui))
      .map(said)
      .join(' ');
    expect(names).toContain(`الحاضرون: ${text.present!.names}`);
    expect(lines.filter((op) => op.lead)).toHaveLength(1);
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
