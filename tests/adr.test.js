// Keeps docs/adr/ navigable: every record is numbered, listed in the index
// with its title, and every relative link between records and code resolves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ADR_DIR = join(import.meta.dirname, '..', 'docs', 'adr');
const RECORDS = readdirSync(ADR_DIR).filter((file) => /^\d{4}-[a-z0-9-]+\.md$/.test(file)).sort();
const INDEX = readFileSync(join(ADR_DIR, 'README.md'), 'utf8');
const read = (file) => readFileSync(join(ADR_DIR, file), 'utf8');

test('records are numbered consecutively from 0001', () => {
  assert.ok(RECORDS.length > 0);
  RECORDS.forEach((file, i) => assert.equal(file.slice(0, 4), String(i + 1).padStart(4, '0')));
});

for (const file of RECORDS) {
  test(`${file} has a matching title, a status and a date, and is listed in the index`, () => {
    const text = read(file);
    assert.match(text, new RegExp(`^# ${Number(file.slice(0, 4))}\\. \\S`));
    assert.match(text, /^- \*\*Status:\*\* (Proposed|Accepted|Deprecated|Superseded by .+)$/m);
    assert.match(text, /^- \*\*Date:\*\* \d{4}-\d{2}-\d{2}$/m);
    assert.ok(INDEX.includes(`](${file})`), `add ${file} to docs/adr/README.md`);
  });
}

test('every relative link in the records resolves', () => {
  const broken = [];
  for (const file of ['README.md', ...RECORDS]) {
    for (const [, target] of read(file).matchAll(/\]\(((?!https?:|#)[^)#]+)(?:#[^)]*)?\)/g)) {
      if (!existsSync(join(ADR_DIR, dirname(file), target))) broken.push(`${file} → ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});
