#!/usr/bin/env node
/**
 * Creates or updates the repository labels from .github/labels.json with the
 * GitHub CLI (run `gh auth login` first). Safe to re-run.
 *
 *   node scripts/setup-labels.js
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const labels = JSON.parse(readFileSync(join(import.meta.dirname, '..', '.github', 'labels.json'), 'utf8'));

for (const { name, color, description = '' } of labels) {
  const result = spawnSync('gh', ['label', 'create', name, '--color', color, '--description', description, '--force'], {
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
