import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HEADERS_PATH = join(import.meta.dirname, '..', '..', 'public', '_headers');

/** Parses Cloudflare Pages' _headers format into { "/path": { Header: value } }. */
export function parseHeaders(text = readFileSync(HEADERS_PATH, 'utf8')) {
  const rules = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = rules[line.trim()] ??= {};
    } else if (current) {
      const i = line.indexOf(':');
      current[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

export function parseCsp(value) {
  return Object.fromEntries(
    value
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...sources] = directive.split(/\s+/);
        return [name, sources];
      })
  );
}

/** The Content-Security-Policy that public/_headers applies to every page. */
export function sitewideCsp() {
  return parseHeaders()['/*']['Content-Security-Policy'];
}
