// The footer's project links are generated from js/links.js; these tests keep
// them pointing at the repository and keep user data out of the URLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LINKS, REPO_URL, reportBugUrl } from '../public/js/links.js';
import { PLATFORM_DEFINITIONS } from '../public/js/platforms.js';
import { MONETIZATION } from '../public/js/monetization.js';

const ROOT = join(import.meta.dirname, '..');

test('every project link is an https URL inside the repository', () => {
  for (const [name, url] of Object.entries(LINKS)) {
    assert.ok(url === REPO_URL || url.startsWith(`${REPO_URL}/`), name);
  }
});

test('the bug-report link prefills only the platform', () => {
  assert.equal(reportBugUrl(null), LINKS.newBug);
  assert.equal(
    reportBugUrl('Systemd / Bare Metal / VM'),
    `${LINKS.newBug}&platform=Systemd%20%2F%20Bare%20Metal%20%2F%20VM`
  );
});

test('every issue-form link points at a template that exists', () => {
  const templates = readdirSync(join(ROOT, '.github', 'ISSUE_TEMPLATE'));
  for (const url of [LINKS.newBug, LINKS.newPlatform, LINKS.newFeature]) {
    assert.ok(templates.includes(new URL(url).searchParams.get('template')), url);
  }
});

test('the bug form offers every calculator platform, as labelled in platforms.js', () => {
  const form = readFileSync(join(ROOT, '.github', 'ISSUE_TEMPLATE', 'bug.yml'), 'utf8');
  for (const { label } of PLATFORM_DEFINITIONS) assert.ok(form.includes(`- ${label}\n`), label);
});

test('the support page links the same Sponsors page as the footer donation link', () => {
  const page = readFileSync(join(ROOT, 'public', 'support', 'index.html'), 'utf8');
  assert.ok(page.includes(`href="${MONETIZATION.donationUrl}"`));
});

test('every calculator page links a bug report for its own platform near the result', () => {
  for (const def of PLATFORM_DEFINITIONS) {
    const html = readFileSync(join(ROOT, 'public', def.path, 'index.html'), 'utf8');
    const href = html.match(/<p class="report-link">[^<]*<a href="([^"]+)"/)?.[1];
    assert.equal(href?.replaceAll('&amp;', '&'), reportBugUrl(def.label), def.path);
  }
});
