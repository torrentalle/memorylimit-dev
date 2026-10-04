import test from 'node:test';
import assert from 'node:assert/strict';
import * as Platforms from '../public/js/platforms.js';

const ALL_IDS = ['kubernetes', 'dockerCompose', 'nomad', 'lambda', 'cloudRun', 'azureFunctions', 'systemd', 'vmware', 'proxmox', 'redis', 'couchbase'];

function withEnabled(overrides, fn) {
  const previous = { ...Platforms.ENABLED_PLATFORMS };
  Object.assign(Platforms.ENABLED_PLATFORMS, overrides);
  try {
    fn();
  } finally {
    Object.assign(Platforms.ENABLED_PLATFORMS, previous);
  }
}

test('every platform is enabled by default, in nav order', () => {
  assert.deepEqual(Platforms.getEnabledPlatforms().map((p) => p.id), ALL_IDS);
});

test('every defined platform has a config flag and vice versa', () => {
  assert.deepEqual(Object.keys(Platforms.ENABLED_PLATFORMS).sort(), [...ALL_IDS].sort());
});

for (const id of ALL_IDS) {
  test(`disabling ${id} removes only that platform`, () => {
    withEnabled({ [id]: false }, () => {
      assert.deepEqual(Platforms.getEnabledPlatforms().map((p) => p.id), ALL_IDS.filter((other) => other !== id));
      assert.equal(Platforms.isEnabled(id), false);
    });
  });
}

test('disabling every platform yields an empty list, not an error', () => {
  withEnabled(Object.fromEntries(ALL_IDS.map((id) => [id, false])), () => {
    assert.deepEqual(Platforms.getEnabledPlatforms(), []);
  });
});

test('getPlatform looks up a definition by id', () => {
  assert.equal(Platforms.getPlatform('kubernetes').path, '/kubernetes/');
  assert.equal(Platforms.getPlatform('nonexistent'), null);
});

test('every platform belongs to a known category', () => {
  const categories = Platforms.PLATFORM_CATEGORIES.map((c) => c.id);
  assert.ok(Platforms.PLATFORM_DEFINITIONS.every((p) => categories.includes(p.category)));
});

test('getPlatformGroups groups platforms by category in order and omits empty categories', () => {
  const groups = Platforms.getPlatformGroups();
  assert.deepEqual(groups.map((g) => g.id), ['containers', 'serverless', 'vms', 'datastores']);
  assert.deepEqual(groups.flatMap((g) => g.platforms.map((p) => p.id)), ALL_IDS);
  const onlyRedis = Platforms.getPlatformGroups(Platforms.PLATFORM_DEFINITIONS.filter((p) => p.id === 'redis'));
  assert.deepEqual(onlyRedis.map((g) => g.id), ['datastores']);
});

test('every platform has a distinct canonical path', () => {
  const paths = Platforms.PLATFORM_DEFINITIONS.map((p) => p.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.every((p) => /^\/[a-z-]+\/$/.test(p)));
});
