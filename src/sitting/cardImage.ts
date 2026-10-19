/* The close of a sitting drawn as a picture, to be saved on the reader's
   device, in one of three designs that say the same thing:

   - ornate, 1080 by 1350: the card in a double frame like the Mushaf's,
     at the 4:5 a phone's photos and most chats show whole;
   - status, 1080 by 1920: the 9:16 of a WhatsApp status or a story, under
     a mihrab's arch, everything kept inside the band those screens leave
     clear of their own bars (SAFE);
   - simple, 1080 by 1080: a square of type alone, set from the right,
     with a hairline or two for its only ornament.

   No library: a <canvas>, the app's own fonts and the theme's own colours.
   Laying a card out is a plain function of its words and a way to measure
   them (`layoutCard`), tested with a fake ruler; only `drawCard` and
   `cardImage` need a browser. The picture is made on the device and goes
   nowhere but where the reader puts it. */

import type { CardDesign } from '@/halaqa/state';
import type { CardText } from './cardText';

export const CARD_WIDTH = 1080;

/** How wide `text` is when drawn in `font`, a CSS font shorthand. */
export type Measure = (text: string, font: string) => number;

/** The theme's colours a picture is drawn in, by what they are for. */
export type Ink = 'fg' | 'muted' | 'gold';

/** The font families, as CSS lists, for the title and name, the text, and
    the supplication: tokens.css's --font-brand, --font-ui, --font-naskh. */
export type Families = { brand: string; ui: string; naskh: string };

export const FAMILIES: Families = {
  brand: "'Reem Kufi', 'IBM Plex Sans Arabic', sans-serif",
  ui: "'IBM Plex Sans Arabic', system-ui, sans-serif",
  naskh: "'Amiri', 'Times New Roman', serif",
};

/** A line of text. `x` is its right edge, where a right-to-left line
    begins, and `width` how far it runs to the left; `y` is its middle and
    `height` the line's own. A line may begin with a `lead` in a quieter
    ink, «الحاضرون:» before the names. */
export type TextOp = {
  kind: 'text';
  text: string;
  font: string;
  ink: Ink;
  x: number;
  y: number;
  width: number;
  height: number;
  lead?: { text: string; font: string; ink: Ink; width: number };
};

/** The ornament between the card's parts, on `y`: the surah headers'
    diamond between two hairlines, centred on `x`, or a short gold rule
    alone, running left from `x`. */
export type RuleOp = {
  kind: 'rule';
  style: 'diamond' | 'line';
  x: number;
  y: number;
  width: number;
};

/** The mark and «مجلس نور» side by side, the mark on the right as in the
    app's header, on `y`. */
export type BrandOp = {
  kind: 'brand';
  y: number;
  mark: { x: number; size: number };
  name: { text: string; font: string; x: number; width: number };
};

export type Op = TextOp | RuleOp | BrandOp;

type Box = { left: number; right: number; top: number; bottom: number };

/** The band of a 9:16 picture that a status or a story leaves clear: its
    progress bar and name over the top, the reply field under the foot. */
export const SAFE = { top: 250, bottom: 1920 - 320 };

/** The status picture's arch: a pointed arch of two arcs of `radius`,
    between its two sides, its point at `apex`. */
export const ARCH = { left: 110, right: 970, apex: 236, radius: 520 };
const ARCH_HALF = (ARCH.right - ARCH.left) / 2;
const ARCH_RISE = Math.sqrt(ARCH.radius ** 2 - (ARCH.radius - ARCH_HALF) ** 2);
const ARCH_SPRING = ARCH.apex + ARCH_RISE;

/** How far the inside of the arch reaches either side of its middle at
    height `y`: its whole half-width below where it springs, nothing above
    its point. */
export function archHalfWidth(y: number) {
  if (y >= ARCH_SPRING) return ARCH_HALF;
  if (y <= ARCH.apex) return 0;
  const up = ARCH_SPRING - y;
  return ARCH_HALF - ARCH.radius + Math.sqrt(ARCH.radius ** 2 - up ** 2);
}

/** One part of the card, before it is placed: its lines' words, how they
    are set, and the room above it. */
type TextBlock = {
  kind: 'text';
  text: string;
  weight: number;
  size: number;
  family: string;
  ink: Ink;
  /** Line height over size. */
  leading: number;
  before: number;
  lead?: { text: string; weight: number; ink: Ink };
};
type Block = TextBlock | { kind: 'rule'; before: number; after: number };

/** A design: its page, the box its words keep inside, how they stand in
    it, where the name sits, and what it says in what order. */
type Spec = {
  width: number;
  height: number;
  content: Box;
  align: 'center' | 'right';
  brand: { y: number; mark: number; size: number };
  blocks: (text: CardText, families: Families) => Block[];
};

const RULE_HEIGHT = 36;

const font = (weight: number, size: number, family: string) =>
  `${weight} ${Math.round(size * 10) / 10}px ${family}`;

/** A maker of text blocks in the UI face, with what a block changes. */
const lines =
  (families: Families) =>
  (
    text: string,
    weight: number,
    size: number,
    ink: Ink,
    before: number,
    rest: Partial<TextBlock> = {},
  ): TextBlock => ({
    kind: 'text',
    text,
    weight,
    size,
    family: families.ui,
    ink,
    leading: 1.5,
    before,
    ...rest,
  });

/** Sizes and spaces of the two centred designs, which say the card in the
    same order and differ in measure: the status picture is taller and
    gives every part more air. */
type Rhythm = {
  title: number;
  day: number;
  date: number;
  read: number;
  amount: number;
  present: number;
  prayer: number;
  prayerLeading: number;
  rule: number;
  gap: number;
};

/** The card line by line, centred: the dates a line each, the time under
    them, the supplication a phrase to a line. */
const centred =
  (r: Rhythm) =>
  (text: CardText, families: Families): Block[] => {
    const line = lines(families);
    const [day, ...others] = text.dates;
    const present = text.present;
    return [
      line(text.title, 600, r.title, 'gold', 0, {
        family: families.brand,
        leading: 1.35,
      }),
      line(day, 500, r.day, 'fg', r.gap * 0.6),
      ...others.map((d) => line(d, 400, r.date, 'muted', 0)),
      line(text.time, 400, r.date, 'muted', 0),
      { kind: 'rule', before: r.rule, after: r.rule },
      ...text.read.map((t, i) => line(t, 500, r.read, 'fg', i ? 4 : 0)),
      ...(text.amount
        ? [line(text.amount, 600, r.amount, 'gold', r.gap * 0.7)]
        : []),
      ...(present
        ? [
            line(present.names, 500, r.present, 'fg', r.gap, {
              lead: { text: `${present.label}:`, weight: 400, ink: 'muted' },
            }),
          ]
        : []),
      { kind: 'rule', before: r.rule, after: r.rule * 0.9 },
      ...text.supplication.map((clause) =>
        line(clause, 400, r.prayer, 'muted', 0, {
          family: families.naskh,
          leading: r.prayerLeading,
        }),
      ),
    ];
  };

/** The square, set from the right: the Gregorian date and the time share
    a line, so the card fits a shorter page with room to spare. */
function plain(text: CardText, families: Families): Block[] {
  const line = lines(families);
  const [day, ...others] = text.dates;
  const present = text.present;
  return [
    line(text.title, 600, 76, 'gold', 0, {
      family: families.brand,
      leading: 1.3,
    }),
    line(day, 500, 34, 'fg', 14),
    line([...others, text.time].join(' · '), 400, 30, 'muted', 0),
    { kind: 'rule', before: 30, after: 30 },
    ...text.read.map((t, i) => line(t, 500, 36, 'fg', i ? 2 : 0)),
    ...(text.amount ? [line(text.amount, 600, 36, 'gold', 14)] : []),
    ...(present
      ? [
          line(present.names, 500, 32, 'fg', 20, {
            lead: { text: `${present.label}:`, weight: 400, ink: 'muted' },
          }),
        ]
      : []),
    { kind: 'rule', before: 30, after: 26 },
    ...text.supplication.map((clause) =>
      line(clause, 400, 36, 'muted', 0, {
        family: families.naskh,
        leading: 1.6,
      }),
    ),
  ];
}

export const DESIGNS: Record<CardDesign, Spec> = {
  ornate: {
    width: CARD_WIDTH,
    height: 1350,
    content: { left: 150, right: CARD_WIDTH - 150, top: 112, bottom: 1124 },
    align: 'center',
    brand: { y: 1205, mark: 64, size: 46 },
    blocks: centred({
      title: 92,
      day: 38,
      date: 32,
      read: 38,
      amount: 40,
      present: 36,
      prayer: 44,
      prayerLeading: 1.65,
      rule: 30,
      gap: 30,
    }),
  },
  status: {
    width: CARD_WIDTH,
    height: 1920,
    content: { left: 170, right: CARD_WIDTH - 170, top: 420, bottom: 1440 },
    align: 'center',
    brand: { y: 1528, mark: 64, size: 46 },
    blocks: centred({
      title: 100,
      day: 40,
      date: 34,
      read: 38,
      amount: 42,
      present: 36,
      prayer: 46,
      prayerLeading: 1.75,
      rule: 40,
      gap: 36,
    }),
  },
  simple: {
    width: CARD_WIDTH,
    height: 1080,
    content: { left: 110, right: CARD_WIDTH - 110, top: 116, bottom: 900 },
    align: 'right',
    brand: { y: 972, mark: 52, size: 38 },
    blocks: plain,
  },
};

/**
 * `text` in lines no wider than `width`, broken between words, never at a
 * no-break space, which cardText puts where words belong together. A word
 * wider than the line has a line to itself and is left to the caller, who
 * can shrink the type: an Arabic word is never broken.
 */
export function wrapLines(
  text: string,
  width: number,
  measure: (s: string) => number,
) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/[^\S\u00a0]+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word;
    if (line && measure(longer) > width) {
      lines.push(line);
      line = word;
    } else line = longer;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The same, with the words shared out evenly between the lines: the
 * narrowest width that needs no more lines than `width` does. Centred
 * text broken greedily leaves a word or two alone on its last line.
 */
export function balancedLines(
  text: string,
  width: number,
  measure: (s: string) => number,
) {
  const lines = wrapLines(text, width, measure);
  if (lines.length < 2) return lines;
  let narrow = 0;
  let wide = width;
  // Halving to within a pixel; a line is hundreds wide.
  while (wide - narrow > 1) {
    const mid = (narrow + wide) / 2;
    if (wrapLines(text, mid, measure).length > lines.length) narrow = mid;
    else wide = mid;
  }
  return wrapLines(text, wide, measure);
}

/** The ops for the blocks at type `scale`, top to bottom from y = 0, and
    how tall and how wide they came out. */
function place(spec: Spec, blocks: Block[], scale: number, measure: Measure) {
  const { left, right } = spec.content;
  const width = right - left;
  const centre = (left + right) / 2;
  const edge = (w: number) =>
    spec.align === 'center' ? centre + w / 2 : right;
  const ops: Op[] = [];
  let y = 0;
  let widest = 0;
  for (const b of blocks) {
    if (b.kind === 'rule') {
      y += b.before * scale;
      const mid = y + (RULE_HEIGHT * scale) / 2;
      ops.push(
        spec.align === 'center'
          ? { kind: 'rule', style: 'diamond', x: centre, y: mid, width: 400 }
          : { kind: 'rule', style: 'line', x: right, y: mid, width: 96 },
      );
      y += (RULE_HEIGHT + b.after) * scale;
      continue;
    }
    y += b.before * scale;
    const f = font(b.weight, b.size * scale, b.family);
    const lead = b.lead && {
      ...b.lead,
      text: `${b.lead.text} `,
      font: font(b.lead.weight, b.size * scale, b.family),
    };
    // The lead is broken with the words after it, so it stays on their
    // first line; it is the only part drawn apart.
    const whole = lead ? `${lead.text}${b.text}` : b.text;
    const broken = balancedLines(whole, width, (s) => measure(s, f));
    const height = b.size * scale * b.leading;
    broken.forEach((l, i) => {
      const op: TextOp = {
        kind: 'text',
        text: l,
        font: f,
        ink: b.ink,
        x: 0,
        y: y + height / 2,
        width: 0,
        height,
      };
      // The lead alone on its line has lost the space after it.
      if (lead && i === 0 && `${l} `.startsWith(lead.text)) {
        const leadWidth = measure(lead.text, lead.font);
        op.text = l.slice(lead.text.length);
        op.lead = {
          text: lead.text,
          font: lead.font,
          ink: lead.ink,
          width: leadWidth,
        };
      }
      op.width = (op.lead?.width ?? 0) + measure(op.text, f);
      op.x = edge(op.width);
      widest = Math.max(widest, op.width);
      ops.push(op);
      y += height;
    });
  }
  return { ops, height: y, widest };
}

/** A laid-out card: its design, its size, and what to draw. */
export type Layout = {
  design: CardDesign;
  width: number;
  height: number;
  ops: Op[];
  /** How far the type was stepped down to fit, 1 for not at all. */
  scale: number;
};

/**
 * The card laid out in `design`: every line placed inside its box, the
 * name at its foot. The type starts at its full size and steps down until
 * everything fits, which only a long circle (eight seats, long names)
 * or a narrow fallback font ever needs; `scale` says how far it went.
 */
export function layoutCard(
  text: CardText,
  measure: Measure,
  design: CardDesign = 'ornate',
  families: Families = FAMILIES,
): Layout {
  const spec = DESIGNS[design];
  const blocks = spec.blocks(text, families);
  const { content } = spec;
  const room = content.bottom - content.top;
  const width = content.right - content.left;
  let scale = 1;
  let laid = place(spec, blocks, scale, measure);
  while ((laid.height > room || laid.widest > width) && scale > 0.5) {
    scale = Math.round((scale - 0.04) * 100) / 100;
    laid = place(spec, blocks, scale, measure);
  }
  // What is left over goes above and below in equal parts, so a short card
  // (nothing read yet) sits in the middle of its room, not at the top.
  const top = content.top + Math.max(0, (room - laid.height) / 2);
  const ops: Op[] = laid.ops.map((op) => ({ ...op, y: op.y + top }));

  const { brand } = spec;
  const nameFont = font(600, brand.size, families.brand);
  const nameWidth = measure(text.brand, nameFont);
  const gap = brand.mark / 4;
  const total = brand.mark + gap + nameWidth;
  const right =
    spec.align === 'center'
      ? (content.left + content.right) / 2 + total / 2
      : content.right;
  ops.push({
    kind: 'brand',
    y: brand.y,
    mark: { x: right - brand.mark, size: brand.mark },
    name: {
      text: text.brand,
      font: nameFont,
      x: right - brand.mark - gap,
      width: nameWidth,
    },
  });
  return { design, width: spec.width, height: spec.height, ops, scale };
}

/** The faces the ops are drawn in, each with the text drawn in it, so
    `document.fonts.load` fetches exactly the subsets that text needs. */
export function facesOf(ops: readonly Op[]) {
  const faces = new Map<string, string>();
  const add = (f: string, text: string) => {
    // One size of a face loads them all; the first one stands for it.
    const face = f.replace(/ [\d.]+px /, ' 16px ');
    faces.set(face, `${faces.get(face) ?? ''}${text}`);
  };
  for (const op of ops) {
    if (op.kind === 'text') {
      add(op.font, op.text);
      if (op.lead) add(op.lead.font, op.lead.text);
    }
    if (op.kind === 'brand') add(op.name.font, op.name.text);
  }
  return faces;
}

/* ---------- Drawing ---------- */

export type Palette = Record<Ink | 'ground' | 'lamp' | 'line', string>;

/** The theme's colours as the page has them now, so the picture is always
    in the theme on the screen. Each is checked by the canvas itself, which
    keeps its last colour for one it cannot read; that falls back to the
    night theme's own. */
export function readPalette(
  ctx: CanvasRenderingContext2D,
  root: Element = document.documentElement,
): Palette {
  const style = getComputedStyle(root);
  const read = (token: string, fallback: string) => {
    ctx.fillStyle = fallback;
    ctx.fillStyle = style.getPropertyValue(token).trim() || fallback;
    return String(ctx.fillStyle);
  };
  return {
    ground: read('--bg', '#0c2019'),
    lamp: read('--lamp', 'rgba(255, 222, 160, 0.09)'),
    fg: read('--fg', '#f4ecdc'),
    muted: read('--muted', '#b9c8b8'),
    gold: read('--gold', '#d9b469'),
    line: read('--gold-line', 'rgba(217, 180, 105, 0.32)'),
  };
}

/** The families from the page's own tokens, so a font changed there is
    the font of the picture too. */
export function readFamilies(root: Element = document.documentElement) {
  const style = getComputedStyle(root);
  const read = (token: string, fallback: string) =>
    style.getPropertyValue(token).trim() || fallback;
  return {
    brand: read('--font-brand', FAMILIES.brand),
    ui: read('--font-ui', FAMILIES.ui),
    naskh: read('--font-naskh', FAMILIES.naskh),
  };
}

/**
 * A colour as the canvas writes it back ('#rrggbb', or 'rgba(r, g, b, a)'
 * when translucent) with nothing of it showing. A light fading to
 * transparent black greys as it goes, which shows on the day theme.
 */
export function clear(colour: string) {
  if (/^#[0-9a-f]{6}$/i.test(colour)) return `${colour}00`;
  return colour.replace(
    /^rgba?\(([^,]+),([^,]+),([^,)]+).*$/,
    'rgba($1,$2,$3, 0)',
  );
}

/** The diamond of the Mushaf's surah headers, in a box `size` wide. */
function diamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  p: Palette,
) {
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = p.ground;
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = size / 14;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r / 2);
  ctx.lineTo(r / 2, 0);
  ctx.lineTo(0, r / 2);
  ctx.lineTo(-r / 2, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  inset: number,
  radius: number,
) {
  const w = width - inset * 2;
  const h = height - inset * 2;
  ctx.beginPath();
  // Safari before 16 has no roundRect; a square frame is still a frame.
  if (typeof ctx.roundRect === 'function')
    ctx.roundRect(inset, inset, w, h, radius);
  else ctx.rect(inset, inset, w, h);
}

/** The app's mark (Logo.tsx), drawn from its own 48-unit drawing. */
function mark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  p: Palette,
) {
  ctx.save();
  ctx.translate(x, y - size / 2);
  ctx.scale(size / 48, size / 48);
  ctx.strokeStyle = p.gold;
  ctx.fillStyle = p.gold;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(24, 24, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const [cx, cy] of [
    [24, 7],
    [38.7, 32.5],
    [9.3, 32.5],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.stroke(
    new Path2D(
      'M24 18.5c-2.4-1.5-5-1.9-7.2-1.3v12.3c2.2-.6 4.8-.2 7.2 1.3 2.4-1.5 5-1.9 7.2-1.3V17.2c-2.2-.6-4.8-.2-7.2 1.3Z',
    ),
  );
  ctx.stroke(new Path2D('M24 18.5v12.3'));
  ctx.restore();
}

/** The ground, and the soft light from above that the app's body has,
    reaching `reach` down the page. */
function ground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  reach: number,
  p: Palette,
) {
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const light = ctx.createRadialGradient(
    cx,
    -reach / 5,
    0,
    cx,
    -reach / 5,
    reach,
  );
  light.addColorStop(0, p.lamp);
  light.addColorStop(1, clear(p.lamp));
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
}

/** The double rule of the Mushaf's frame, with the headers' diamond at
    its head and foot. */
function frame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  p: Palette,
) {
  const outer = 44;
  const inner = 60;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  roundRect(ctx, width, height, outer, 36);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundRect(ctx, width, height, inner, 24);
  ctx.stroke();
  const between = (outer + inner) / 2;
  diamond(ctx, width / 2, between, 40, p);
  diamond(ctx, width / 2, height - between, 40, p);
}

/** The status picture's arch: a mihrab's pointed arch in one hairline,
    the lamp's light inside it, closed at its foot, with the headers'
    diamond at its point and in the middle of its foot. */
function arch(ctx: CanvasRenderingContext2D, p: Palette) {
  const { left, right, apex, radius } = ARCH;
  const foot = SAFE.bottom + 24;
  // Each arc's centre is on the springing line, `radius` in from its side.
  const sweep = Math.asin(ARCH_RISE / radius);
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(left, foot);
    ctx.lineTo(left, ARCH_SPRING);
    ctx.arc(left + radius, ARCH_SPRING, radius, Math.PI, Math.PI + sweep);
    ctx.arc(right - radius, ARCH_SPRING, radius, -sweep, 0);
    ctx.lineTo(right, foot);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = p.lamp;
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  diamond(ctx, left + ARCH_HALF, apex, 34, p);
  diamond(ctx, left + ARCH_HALF, foot, 34, p);
}

/** Draws a laid-out card on a canvas its own size. */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  p: Palette,
) {
  const { width, height, design } = layout;
  ground(ctx, width, height, design === 'status' ? 1400 : 1000, p);
  if (design === 'ornate') frame(ctx, width, height, p);
  if (design === 'status') arch(ctx, p);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const op of layout.ops) {
    if (op.kind === 'text') {
      let x = op.x;
      if (op.lead) {
        ctx.font = op.lead.font;
        ctx.fillStyle = p[op.lead.ink];
        ctx.fillText(op.lead.text, x, op.y);
        x -= op.lead.width;
      }
      ctx.font = op.font;
      ctx.fillStyle = p[op.ink];
      ctx.fillText(op.text, x, op.y);
    } else if (op.kind === 'rule' && op.style === 'diamond') {
      const reach = op.width / 2 - 30;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(op.x - 30 - reach, op.y);
      ctx.lineTo(op.x - 30, op.y);
      ctx.moveTo(op.x + 30, op.y);
      ctx.lineTo(op.x + 30 + reach, op.y);
      ctx.stroke();
      diamond(ctx, op.x, op.y, 30, p);
    } else if (op.kind === 'rule') {
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(op.x, op.y);
      ctx.lineTo(op.x - op.width, op.y);
      ctx.stroke();
    } else {
      mark(ctx, op.mark.x, op.y, op.mark.size, p);
      ctx.font = op.name.font;
      ctx.fillStyle = p.gold;
      ctx.fillText(op.name.text, op.name.x, op.y);
    }
  }
}

/**
 * The card as a PNG in `design`, in the theme and fonts on the screen now.
 * Every face it uses is loaded first, since a canvas draws in whatever has
 * arrived and never redraws; one that cannot load (offline, never cached)
 * is drawn in the next font of its list rather than failing the picture.
 */
export async function cardImage(
  text: CardText,
  design: CardDesign = 'ornate',
): Promise<Blob> {
  const { width, height } = DESIGNS[design];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas');
  const families = readFamilies();
  const measure: Measure = (s, f) => {
    ctx.font = f;
    return ctx.measureText(s).width;
  };
  const faces = facesOf(layoutCard(text, measure, design, families).ops);
  await Promise.all(
    [...faces].map(([face, sample]) =>
      document.fonts.load(face, sample).catch(() => []),
    ),
  );
  // Laid out again in the fonts as they now are, since the first pass may
  // have measured a fallback.
  drawCard(ctx, layoutCard(text, measure, design, families), readPalette(ctx));
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('no picture'))),
      'image/png',
    ),
  );
}
