/* The close of a sitting drawn as a picture, 1080 by 1350 (the 4:5 a phone's
   photos and most chats show whole), to be saved on the reader's device.

   No library: a <canvas>, the app's own fonts and the theme's own colours.
   Laying the card out is a plain function of its words and a way to
   measure them (`layoutCard`), tested with a fake ruler; only `drawCard`
   and `cardImage` need a browser. The picture is made on the device and
   goes nowhere but where the reader puts it. */

import type { CardText } from './cardText';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

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
    begins, and `width` how far it runs to the left; `y` is its middle. A
    line may begin with a `lead` in a quieter ink, «الحاضرون:» before the
    names. */
export type TextOp = {
  kind: 'text';
  text: string;
  font: string;
  ink: Ink;
  x: number;
  y: number;
  width: number;
  lead?: { text: string; font: string; ink: Ink; width: number };
};

/** The ornament between the card's parts, centred on `y`. */
export type RuleOp = { kind: 'rule'; y: number };

/** The mark and «مجلس نور» side by side, the mark on the right as in the
    app's header, centred on `y`. */
export type BrandOp = {
  kind: 'brand';
  y: number;
  mark: { x: number; size: number };
  name: { text: string; font: string; x: number };
};

export type Op = TextOp | RuleOp | BrandOp;

/* The page. A double rule, as the Mushaf's frame is, inset from the edge;
   the text keeps well inside it, and the name sits at its foot. */
const CX = CARD_WIDTH / 2;
export const FRAME = { outer: 44, inner: 60 };
export const CONTENT = {
  left: 150,
  right: CARD_WIDTH - 150,
  top: 120,
  bottom: 1110,
};
const BRAND_Y = 1205;
const RULE_HEIGHT = 36;

const font = (weight: number, size: number, family: string) =>
  `${weight} ${Math.round(size * 10) / 10}px ${family}`;

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

/** One part of the card, before it is placed: its lines' words, how they
    are set, and the room above it. */
type Block =
  | {
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
    }
  | { kind: 'rule'; before: number; after: number };

function blocksOf(text: CardText, families: Families): Block[] {
  const ui = families.ui;
  const line = (
    t: string,
    weight: number,
    size: number,
    ink: Ink,
    before: number,
    rest: Partial<Extract<Block, { kind: 'text' }>> = {},
  ): Block => ({
    kind: 'text',
    text: t,
    weight,
    size,
    family: ui,
    ink,
    leading: 1.5,
    before,
    ...rest,
  });
  const [day, ...others] = text.dates;
  const present = text.present;
  return [
    line(text.title, 600, 92, 'gold', 0, {
      family: families.brand,
      leading: 1.35,
    }),
    line(day, 500, 38, others.length ? 'fg' : 'muted', 20),
    ...others.map((d) => line(d, 400, 34, 'muted', 0)),
    { kind: 'rule', before: 34, after: 34 },
    ...text.read.map((r, i) => line(r, 500, 38, 'fg', i ? 4 : 0)),
    ...(text.amount ? [line(text.amount, 600, 40, 'gold', 22)] : []),
    ...(present
      ? [
          line(present.names, 500, 36, 'fg', 30, {
            lead: { text: `${present.label}:`, weight: 400, ink: 'muted' },
          }),
        ]
      : []),
    { kind: 'rule', before: 34, after: 30 },
    ...text.supplication.map((clause) =>
      line(clause, 400, 44, 'muted', 0, {
        family: families.naskh,
        leading: 1.75,
      }),
    ),
  ];
}

/** The ops for the blocks at type `scale`, top to bottom from y = 0, and
    how tall and how wide they came out. */
function place(blocks: Block[], scale: number, measure: Measure) {
  const width = CONTENT.right - CONTENT.left;
  const ops: Op[] = [];
  let y = 0;
  let widest = 0;
  for (const b of blocks) {
    if (b.kind === 'rule') {
      y += b.before * scale;
      ops.push({ kind: 'rule', y: y + (RULE_HEIGHT * scale) / 2 });
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
    const lines = balancedLines(whole, width, (s) => measure(s, f));
    const height = b.size * scale * b.leading;
    lines.forEach((l, i) => {
      const op: TextOp = {
        kind: 'text',
        text: l,
        font: f,
        ink: b.ink,
        x: 0,
        y: y + height / 2,
        width: 0,
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
      op.x = CX + op.width / 2;
      widest = Math.max(widest, op.width);
      ops.push(op);
      y += height;
    });
  }
  return { ops, height: y, widest };
}

/**
 * The card laid out: every line placed, centred, inside the frame, the
 * name at its foot. The type starts at its full size and steps down until
 * everything fits, which only a long circle (eight seats, long names)
 * or a narrow fallback font ever needs; `scale` says how far it went.
 */
export function layoutCard(
  text: CardText,
  measure: Measure,
  families: Families = FAMILIES,
): { ops: Op[]; scale: number } {
  const blocks = blocksOf(text, families);
  const room = CONTENT.bottom - CONTENT.top;
  const width = CONTENT.right - CONTENT.left;
  let scale = 1;
  let laid = place(blocks, scale, measure);
  while ((laid.height > room || laid.widest > width) && scale > 0.5) {
    scale = Math.round((scale - 0.04) * 100) / 100;
    laid = place(blocks, scale, measure);
  }
  // What is left over goes above and below in equal parts, so a short card
  // (nothing read yet) sits in the middle of its frame, not at the top.
  const top = CONTENT.top + Math.max(0, (room - laid.height) / 2);
  const ops: Op[] = laid.ops.map((op) => ({ ...op, y: op.y + top }));

  const nameFont = font(600, 46, families.brand);
  const mark = 64;
  const gap = 16;
  const total = mark + gap + measure(text.brand, nameFont);
  const right = CX + total / 2;
  ops.push({
    kind: 'brand',
    y: BRAND_Y,
    mark: { x: right - mark, size: mark },
    name: { text: text.brand, font: nameFont, x: right - mark - gap },
  });
  return { ops, scale };
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
  inset: number,
  radius: number,
) {
  const w = CARD_WIDTH - inset * 2;
  const h = CARD_HEIGHT - inset * 2;
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

/** Draws the laid-out card on a canvas the size of the card. */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  ops: readonly Op[],
  p: Palette,
) {
  // The ground, and the soft light from above that the app's body has.
  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const light = ctx.createRadialGradient(CX, -200, 0, CX, -200, 1000);
  light.addColorStop(0, p.lamp);
  light.addColorStop(1, clear(p.lamp));
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // The double rule of the frame, with the headers' diamond at its head
  // and foot.
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  roundRect(ctx, FRAME.outer, 36);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundRect(ctx, FRAME.inner, 24);
  ctx.stroke();
  const between = (FRAME.outer + FRAME.inner) / 2;
  diamond(ctx, CX, between, 40, p);
  diamond(ctx, CX, CARD_HEIGHT - between, 40, p);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const op of ops) {
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
    } else if (op.kind === 'rule') {
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CX - 200, op.y);
      ctx.lineTo(CX - 30, op.y);
      ctx.moveTo(CX + 30, op.y);
      ctx.lineTo(CX + 200, op.y);
      ctx.stroke();
      diamond(ctx, CX, op.y, 30, p);
    } else {
      mark(ctx, op.mark.x, op.y, op.mark.size, p);
      ctx.font = op.name.font;
      ctx.fillStyle = p.gold;
      ctx.fillText(op.name.text, op.name.x, op.y);
    }
  }
}

/**
 * The card as a PNG, in the theme and fonts on the screen now. Every face
 * it uses is loaded first, since a canvas draws in whatever has arrived and
 * never redraws; one that cannot load (offline, never cached) is drawn in
 * the next font of its list rather than failing the picture.
 */
export async function cardImage(text: CardText): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas');
  const families = readFamilies();
  const measure: Measure = (s, f) => {
    ctx.font = f;
    return ctx.measureText(s).width;
  };
  const faces = facesOf(layoutCard(text, measure, families).ops);
  await Promise.all(
    [...faces].map(([face, sample]) =>
      document.fonts.load(face, sample).catch(() => []),
    ),
  );
  // Laid out again in the fonts as they now are, since the first pass may
  // have measured a fallback.
  drawCard(ctx, layoutCard(text, measure, families).ops, readPalette(ctx));
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('no picture'))),
      'image/png',
    ),
  );
}
