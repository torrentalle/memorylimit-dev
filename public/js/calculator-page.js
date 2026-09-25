/**
 * Entry point for every calculator page. Reads the platform from
 * <body data-platform>, loads only that platform's formatter, and starts the
 * calculator. Each page also declares <link rel="modulepreload"> for its
 * formatter, so the dynamic import doesn't cost an extra round trip.
 *
 * The window `load` event doesn't wait for a dynamic import, so the page sets
 * <html data-calculator-ready> once the calculator is wired up; the e2e
 * tests wait for it.
 */
import './site.js';
import { initCalculator } from './app.js';
import { getPlatform, formatterUrl } from './platforms.js';

const platformId = document.body.dataset.platform;
const platform = getPlatform(platformId);
if (!platform) throw new Error(`MemoryLimit: unknown platform "${platformId}" on <body data-platform>`);

const formatter = await import(formatterUrl(platform));
initCalculator({ platformId, formatter });
document.documentElement.dataset.calculatorReady = '';
