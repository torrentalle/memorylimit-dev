import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateRawSizing } from '../../public/js/calculator.js';
import * as proxmox from '../../public/js/formatters/proxmox.js';

const BASE = { averageMiB: 400, peakMiB: 500, workloadType: 'generic', sensitivity: 'medium', environment: 'production', replicas: 1 };
const raw = (overrides = {}) => calculateRawSizing({ ...BASE, ...overrides });

test('golden: exact qm command and web UI steps for a known input', () => {
  const result = proxmox.format(raw({ averageMiB: 450.4, peakMiB: 629.4 }));
  assert.equal(result.snippet.code, 'qm set <vmid> --memory 819 --balloon 586');
  assert.equal(
    result.alternative.code,
    'VM → Hardware → Memory → Edit → tick Advanced → Memory (MiB): 819, Minimum memory (MiB): 586, Ballooning Device: on.'
  );
});

test('minimum memory and memory round up to a whole MiB and no further', () => {
  const input = raw({ averageMiB: 401, peakMiB: 601 });
  const result = proxmox.format(input);
  assert.equal(result.balloon, Math.ceil(input.requestMiB));
  assert.equal(result.memory, Math.ceil(input.limitMiB));
});

test('never sets the minimum above memory, which Proxmox rejects', () => {
  const result = proxmox.format(raw({ workloadType: 'cache', averageMiB: 1000, peakMiB: 1020 }));
  assert.equal(result.memory, result.balloon);
  assert.ok(result.warnings.some((w) => w.code === 'memory-raised-to-minimum'));
  assert.match(result.explanationSteps[1].text, /raised to the minimum → 1350 MiB$/);
});

test('memory is never below Proxmox’s 16 MiB', () => {
  const result = proxmox.format(raw({ averageMiB: 5, peakMiB: 6 }));
  assert.equal(result.memory, proxmox.MIN_MEMORY_MIB);
  assert.match(result.explanationSteps[1].text, /raised to Proxmox’s 16 MiB → 16 MiB$/);
});

test('explains the derivation in two short steps with the real numbers', () => {
  assert.deepEqual(proxmox.format(raw({ averageMiB: 410, peakMiB: 630 })).explanationSteps, [
    { label: 'Minimum memory', text: '410 MiB average + 30% = 533 MiB → 533 MiB' },
    { label: 'Memory', text: '630 MiB peak + 30% = 819 MiB → 819 MiB' }
  ]);
});

test('the note covers auto-ballooning, the host reserve and the Windows driver within three sentences', () => {
  const { note } = proxmox.format(raw());
  assert.match(note, /80% by default/);
  assert.match(note, /1 GB of RAM for the host/);
  assert.match(note, /advises against it for critical systems/);
  assert.ok(note.split(/(?<=\.) /).length <= 3);
});

// The guide's worked examples are checked against this formatter, so the page can't drift from it.
const guide = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'proxmox', 'how-it-works', 'index.html'), 'utf8');

test('every number in the guide’s examples is what the formatter gives', () => {
  const tables = [...guide.matchAll(/<table[^>]*data-example="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g)];
  assert.ok(tables.length >= 2);
  for (const [, example, body] of tables) {
    const [averageMiB, peakMiB, workloadType, sensitivity, environment] = example.split(' ');
    const result = proxmox.format(calculateRawSizing({ averageMiB: Number(averageMiB), peakMiB: Number(peakMiB), workloadType, sensitivity, environment }));
    const expected = { balloon: `${result.balloon} MiB`, memory: `${result.memory} MiB` };
    const checks = [...body.matchAll(/data-check="(\w+)">([^<]+)</g)];
    assert.ok(checks.length >= 2, example);
    for (const [, key, text] of checks) assert.equal(text, expected[key], `${example} ${key}`);
  }
});

test('the guide cites the Proxmox documentation and source', () => {
  for (const url of [
    'https://pve.proxmox.com/pve-docs/chapter-qm.html',
    'https://pve.proxmox.com/pve-docs/qm.1.html',
    'https://github.com/proxmox/qemu-server/blob/master/src/PVE/API2/Qemu.pm'
  ]) assert.ok(guide.includes(url), url);
  assert.ok(guide.includes('href="/sizing-model/"'));
});
