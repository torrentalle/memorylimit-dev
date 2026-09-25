# 11. The logo as SVG generated from measured geometry

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

The logo existed only as a raster image: one 1920 px PNG with three variants (full colour on white, and
monochrome versions for grey and dark backgrounds). There was no vector file, and the wordmark's typeface
wasn't known. The site needs the logo at very different sizes: a favicon at 16 px, the header at 28 px,
the share image and the README at several hundred pixels. It also needs the logo to follow the light and
dark themes.

## Decision

- **Redraw, not trace.** The logo was redrawn as geometry in `scripts/brand/logo.js`. Every edge was
  measured on the PNG with sub-pixel precision, using the antialiasing, and fitted as a straight line or a
  superellipse, with an error of 0.1 to 0.45 px. Rendered at the original size, the SVG covers 99% of the
  original's pixels. Automatic tracing was rejected: it gives uneven edges, loses the gradient, and needs
  one file per colour.
- **No font dependency.** The wordmark turned out to be Corbel Regular (99% pixel overlap), which isn't
  free to self-host. The logo keeps the letters as outlines, so no font is loaded.
- **Generated files, checked by a test.** `npm run generate:brand` writes:
  - the logo and monogram SVGs in each colour variant, to `public/brand/`;
  - `favicon.svg`, `favicon.ico` (16, 32 and 48 px) and `apple-touch-icon.png`.

  `tests/brand.test.js` fails if the committed SVGs drift from the generator.
- **A simplified favicon.** Below about 48 px the node's ring disappears and the strokes get too thin, so
  the favicon drops the ring and thickens every shape. It is square and follows the browser's colour scheme.
- **The header swaps two images.** The header shows the colour monogram on light themes and the
  light-grey one on dark themes. The swap is two `<img>` elements switched by the same CSS rules as the
  theme, rather than an inline SVG.

## Alternatives considered

- **An inline SVG coloured with CSS variables.** It would follow the theme with a single element, but it
  would copy about a kilobyte of path data into every page by hand, or it would need `sync:pages` to
  generate it.
- **One SVG with a `prefers-color-scheme` media query.** It follows the operating system, but not the
  site's own theme toggle. That is fine for the favicon, which sits in the browser's own interface, but
  not for the header.
- **Setting the wordmark as text in a free lookalike.** Inter came closest, at 91% overlap, but the letters
  visibly differ from the original logo.

## Consequences

- The logo is sharp at every size, weighs 1–3 KB per file, and a colour change is a one-line edit in
  `logo.js` plus a re-run of the generator.
- The share image embeds the logo, so its stamp now hashes every file the source references. Changing the
  logo makes `tests/og-image.test.js` fail until the image is re-rendered.
- The geometry's coordinates are in the original PNG's pixel space, so they aren't round numbers. The
  numbers are fits, not design decisions, and `logo.js` says so.
- The raster icons need a browser to render, like the share image, but the SVGs don't.
