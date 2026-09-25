/**
 * The MemoryLimit logo, as geometry. It was redrawn from the original raster
 * artwork: every edge was measured with sub-pixel precision (from the
 * antialiasing) and fitted as a straight line or a superellipse. Coordinates
 * are in that artwork's pixel space (1920 px wide), which is why they aren't
 * round numbers; each SVG's viewBox crops to the part it needs.
 *
 * The wordmark's letters match Corbel Regular (99% pixel overlap), but they
 * are outlines here, so nothing depends on the font.
 *
 * Pure: builds SVG strings only. scripts/generate-brand.js writes the files.
 */

const f = (n) => +n.toFixed(2);
const poly = (points) => `M ${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`;
const rect = (x0, y0, x1, y1) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

// Bézier handle factor that puts a quarter's midpoint on the superellipse
// |x/rx|^n + |y/ry|^n = 1 (0.5523 for a circle, n = 2).
const handle = (n) => (2 ** (-1 / n) - 0.5) / 0.375;

function superellipse(cx, cy, rx, ry, n, reverse = false) {
  const [kx, ky] = [rx * handle(n), ry * handle(n)];
  const s = reverse ? -1 : 1;
  return [
    `M ${f(cx)} ${f(cy - ry)}`,
    `C ${f(cx + s * kx)} ${f(cy - ry)} ${f(cx + s * rx)} ${f(cy - ky)} ${f(cx + s * rx)} ${f(cy)}`,
    `C ${f(cx + s * rx)} ${f(cy + ky)} ${f(cx + s * kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)}`,
    `C ${f(cx - s * kx)} ${f(cy + ry)} ${f(cx - s * rx)} ${f(cy + ky)} ${f(cx - s * rx)} ${f(cy)}`,
    `C ${f(cx - s * rx)} ${f(cy - ky)} ${f(cx - s * kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} Z`
  ].join(' ');
}

const circle = (cx, cy, r) => superellipse(cx, cy, r, r, 2);

// The R's bowl: straight top and bottom edges from x0, joined by two
// superellipse quarters fitted separately (the bowl is fuller at the top).
// A hole is the same outline wound the other way.
function bowl(x0, cy, top, bottom, hole = false) {
  const [a, b] = [top, bottom];
  const [ka, kb] = [handle(a.n), handle(b.n)];
  const xm = a.xs + a.rx;
  if (!hole) {
    return `M ${f(x0)} ${f(cy - a.ry)} L ${f(a.xs)} ${f(cy - a.ry)} ` +
      `C ${f(a.xs + a.rx * ka)} ${f(cy - a.ry)} ${f(xm)} ${f(cy - a.ry * ka)} ${f(xm)} ${f(cy)} ` +
      `C ${f(xm)} ${f(cy + b.ry * kb)} ${f(b.xs + b.rx * kb)} ${f(cy + b.ry)} ${f(b.xs)} ${f(cy + b.ry)} ` +
      `L ${f(x0)} ${f(cy + b.ry)} Z`;
  }
  return `M ${f(x0)} ${f(cy - a.ry)} L ${f(x0)} ${f(cy + b.ry)} L ${f(b.xs)} ${f(cy + b.ry)} ` +
    `C ${f(b.xs + b.rx * kb)} ${f(cy + b.ry)} ${f(xm)} ${f(cy + b.ry * kb)} ${f(xm)} ${f(cy)} ` +
    `C ${f(xm)} ${f(cy - a.ry * ka)} ${f(a.xs + a.rx * ka)} ${f(cy - a.ry)} ${f(a.xs)} ${f(cy - a.ry)} Z`;
}

// ---- monogram: an M whose right diagonal rises into the L ------------------

const MONO = {
  top: 210.8, base: 646.7, stroke: 46, slope: 0.4, diagonalWidth: 50, dotR: 43,
  mStemX: 649, lStemX: 989, footTop: 601.7, dotY: 624, rightDotX: 1248,
  node: { x: 1012, y: 214, ringR: 28.85, ringWidth: 4.5 },
  // Reference points: the left diagonal's upper edge, the right diagonal's left edge.
  leftDiagonal: [746, 340.5], rightDiagonal: [875, 500.5],
  // The right diagonal fades from the L's colour (top) to the M's (bottom).
  gradientY: [234, 622]
};

function monogram() {
  const { top, base, stroke: s, slope: k, diagonalWidth: dw, node } = MONO;
  const aL = MONO.leftDiagonal[0] - k * MONO.leftDiagonal[1];
  const upperL = (y) => aL + k * y;
  const lowerL = (y) => aL - dw + k * y;
  const bR = MONO.rightDiagonal[0] + k * MONO.rightDiagonal[1];
  const leftR = (y) => bR - k * y;
  const rightR = (y) => bR + dw - k * y;
  const stemRight = MONO.mStemX + s;
  const yJoin = (stemRight - (aL - dw)) / k; // the left diagonal leaves the stem

  return {
    // The M: stem, left diagonal and bottom-left dot, plus the node.
    memory: [
      poly([[MONO.mStemX, top], [upperL(top), top], [upperL(base), base], [lowerL(base), base],
        [stemRight, yJoin], [stemRight, MONO.dotY], [MONO.mStemX, MONO.dotY]]),
      circle(MONO.mStemX + s / 2, MONO.dotY, MONO.dotR),
      circle(node.x, node.y, MONO.dotR)
    ],
    // The M's right diagonal, from the node's centre down to the baseline.
    diagonal: poly([[leftR(node.y), node.y], [rightR(node.y), node.y], [rightR(base), base], [leftR(base), base]]),
    // The L: stem, foot and bottom-right dot.
    limit: [
      rect(MONO.lStemX, node.y, MONO.lStemX + s, base),
      rect(MONO.lStemX, MONO.footTop, MONO.rightDotX, base),
      circle(MONO.rightDotX, MONO.dotY, MONO.dotR)
    ],
    ring: node,
    gradientY: MONO.gradientY
  };
}

// ---- wordmark: MEMORYLIMIT --------------------------------------------------

const CAP_TOP = 761, BASELINE = 871, STEM = 14, BAR = 12;

// The M's edges, fitted on the first M as x = a + k*y. Its stems are thinner
// (13.41) than the other letters', and each diagonal widens slightly towards
// the vertex, so the four diagonal edges are independent lines.
const M_FIT = {
  x0: 334, x1: 444.84, stem: 13.41,
  leftLower: [22.09, 0.4179], leftUpper: [42.78, 0.4086],
  rightUpper: [736.17, -0.4088], rightLower: [756.79, -0.418]
};

function letterM(x0) {
  const [t, b, d] = [CAP_TOP, BASELINE, x0 - M_FIT.x0];
  const x = ([a, k], y) => a + d + k * y;
  const yAt = ([a, k], xv) => (xv - a - d) / k;
  const [L, R, s] = [x0, M_FIT.x1 + d, M_FIT.stem];
  const yApex = (M_FIT.rightUpper[0] - M_FIT.leftUpper[0]) / (M_FIT.leftUpper[1] - M_FIT.rightUpper[1]);
  return poly([
    [L, t], [x(M_FIT.leftUpper, t), t], [x(M_FIT.leftUpper, yApex), yApex], [x(M_FIT.rightUpper, t), t], [R, t],
    [R, b], [R - s, b], [R - s, yAt(M_FIT.rightLower, R - s)], [x(M_FIT.rightLower, b), b],
    [x(M_FIT.leftLower, b), b], [L + s, yAt(M_FIT.leftLower, L + s)], [L + s, b], [L, b]
  ]);
}

const letterE = (x0, topEnd, midEnd, bottomEnd) => [
  rect(x0, CAP_TOP, x0 + STEM, BASELINE), rect(x0, CAP_TOP, topEnd, CAP_TOP + BAR),
  rect(x0, 809, midEnd, 809 + BAR), rect(x0, BASELINE - BAR, bottomEnd, BASELINE)
].join(' ');

const letterO = () => [
  superellipse(782.7, 816, 51.97, 57, 2.16),
  superellipse(782.7, 816, 37.9, 44.95, 2.19, true)
].join(' ');

function letterR(x0) {
  const leftEdge = (y) => 289.04 + 0.7391 * y;
  const rightEdge = (y) => 286.71 + 0.7612 * y;
  return [
    rect(x0, CAP_TOP, x0 + STEM, BASELINE),
    bowl(x0, 792.5, { xs: 900.75, rx: 42.3, ry: 31.5, n: 2.3 }, { xs: 897, rx: 46.05, ry: 32.5, n: 2.27 }),
    bowl(x0 + STEM, 792, { xs: 897, rx: 31.76, ry: 19, n: 2.57 }, { xs: 894.25, rx: 34.51, ry: 21, n: 2.6 }, true),
    poly([[leftEdge(813), 813], [rightEdge(813), 813], [rightEdge(BASELINE), BASELINE], [leftEdge(BASELINE), BASELINE]])
  ].join(' ');
}

function letterY() {
  const [t, b] = [CAP_TOP, BASELINE];
  const outerL = [503.33, 0.611], innerL = [528.5, 0.5972], innerR = [1502.05, -0.5974], outerR = [1527.14, -0.6111];
  const x = ([a, k], y) => a + k * y;
  const yAt = ([a, k], xv) => (xv - a) / k;
  const [s0, s1] = [1008.53, 1022];
  const yCrotch = (innerR[0] - innerL[0]) / (innerL[1] - innerR[1]);
  return poly([
    [x(outerL, t), t], [x(innerL, t), t], [x(innerL, yCrotch), yCrotch], [x(innerR, t), t], [x(outerR, t), t],
    [s1, yAt(outerR, s1)], [s1, b], [s0, b], [s0, yAt(outerL, s0)]
  ]);
}

const letterI = (x0) => rect(x0, CAP_TOP, x0 + STEM, BASELINE);
const letterL = (x0, end) => [rect(x0, CAP_TOP, x0 + STEM, BASELINE), rect(x0, BASELINE - BAR, end, BASELINE)].join(' ');
const letterT = (x0, x1, stemX) => [rect(x0, CAP_TOP, x1, CAP_TOP + BAR), rect(stemX, CAP_TOP, stemX + STEM, BASELINE)].join(' ');

function wordmark() {
  return {
    memory: [letterM(334), letterE(483, 550, 544, 553), letterM(586), letterO(), letterR(869), letterY()],
    limit: [letterL(1089, 1156), letterI(1188), letterM(1239), letterI(1388), letterT(1429, 1517, 1466)]
  };
}

// ---- SVG --------------------------------------------------------------------

/** Colour schemes from the original artwork. */
export const VARIANTS = {
  colour: { memory: '#004255', limit: '#007491', ring: '#ffffff' },
  onDark: { memory: '#c0c0c0', limit: '#ffffff', ring: '#ffffff' },
  mono: { memory: '#000000', limit: '#494949', ring: '#c0c0c0' }
};

const BOUNDS = { lockup: [334, 171, 1517, 873], mark: [629, 171, 1291, 667] };

/**
 * @param {object} options
 * @param {'lockup'|'mark'} [options.kind='lockup'] - monogram + wordmark, or the monogram alone
 * @param {keyof VARIANTS} [options.variant='colour']
 */
export function logoSvg({ kind = 'lockup', variant = 'colour' } = {}) {
  const c = VARIANTS[variant];
  const m = monogram();
  const [x0, y0, x1, y1] = BOUNDS[kind];
  const { x: cx, y: cy, ringR, ringWidth } = m.ring;
  const words = kind === 'lockup' ? wordmark() : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="img">
<title>MemoryLimit</title>
<defs><linearGradient id="ml-diagonal" gradientUnits="userSpaceOnUse" x1="0" y1="${m.gradientY[0]}" x2="0" y2="${m.gradientY[1]}"><stop offset="0" stop-color="${c.limit}"/><stop offset="1" stop-color="${c.memory}"/></linearGradient></defs>
<path fill="${c.limit}" d="${m.limit.join(' ')}"/>
<path fill="url(#ml-diagonal)" d="${m.diagonal}"/>
<path fill="${c.memory}" d="${m.memory.join(' ')}"/>
<circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${c.ring}" stroke-width="${ringWidth}"/>${words ? `
<path fill="${c.memory}" d="${words.memory.join(' ')}"/>
<path fill="${c.limit}" d="${words.limit.join(' ')}"/>` : ''}
</svg>
`;
}

/**
 * The favicon: the monogram simplified for 16–48 px. Square, no ring (it
 * disappears below ~48 px), and every shape thickened with a stroke in its
 * own colour. Follows the browser's light/dark scheme.
 */
export function faviconSvg() {
  const m = monogram();
  const [x0, y0, x1, y1] = BOUNDS.mark;
  const side = 700;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const { colour: light, onDark: dark } = VARIANTS;
  const bold = 'stroke-width="20" stroke-linejoin="miter"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(cx - side / 2)} ${f(cy - side / 2)} ${side} ${side}">
<style>.m{fill:${light.memory};stroke:${light.memory}}.l{fill:${light.limit};stroke:${light.limit}}.g0{stop-color:${light.limit}}.g1{stop-color:${light.memory}}@media (prefers-color-scheme:dark){.m{fill:${dark.memory};stroke:${dark.memory}}.l{fill:${dark.limit};stroke:${dark.limit}}.g0{stop-color:${dark.limit}}.g1{stop-color:${dark.memory}}}</style>
<defs><linearGradient id="d" gradientUnits="userSpaceOnUse" x1="0" y1="${m.gradientY[0]}" x2="0" y2="${m.gradientY[1]}"><stop offset="0" class="g0"/><stop offset="1" class="g1"/></linearGradient></defs>
<path class="l" ${bold} d="${m.limit.join(' ')}"/>
<path fill="url(#d)" stroke="url(#d)" ${bold} d="${m.diagonal}"/>
<path class="m" ${bold} d="${m.memory.join(' ')}"/>
</svg>
`;
}

/** Every SVG under public/brand/, by file name. */
export const BRAND_SVGS = {
  'memorylimit-logo.svg': () => logoSvg({ kind: 'lockup', variant: 'colour' }),
  'memorylimit-logo-on-dark.svg': () => logoSvg({ kind: 'lockup', variant: 'onDark' }),
  'memorylimit-logo-mono.svg': () => logoSvg({ kind: 'lockup', variant: 'mono' }),
  'memorylimit-mark.svg': () => logoSvg({ kind: 'mark', variant: 'colour' }),
  'memorylimit-mark-on-dark.svg': () => logoSvg({ kind: 'mark', variant: 'onDark' })
};
