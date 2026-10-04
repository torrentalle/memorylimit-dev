/**
 * Project links shown in the footer and on /support/. scripts/sync-pages.js
 * writes them into every page's HTML, so they work without JavaScript;
 * tests/links.test.js keeps them pointing at the repository.
 */
export const REPO_URL = 'https://github.com/torrentalle/memorylimit-dev';

export const LINKS = {
  repo: REPO_URL,
  issues: `${REPO_URL}/issues`,
  discussions: `${REPO_URL}/discussions`,
  questions: `${REPO_URL}/discussions/categories/q-a`,
  ideas: `${REPO_URL}/discussions/categories/ideas`,
  newBug: `${REPO_URL}/issues/new?template=bug.yml`,
  newPlatform: `${REPO_URL}/issues/new?template=platform-request.yml`,
  newFeature: `${REPO_URL}/issues/new?template=feature.yml`,
  security: `${REPO_URL}/security/advisories/new`
};

/**
 * Bug-report link for a calculator page. Only the platform is prefilled,
 * never anything the visitor pasted: inputs must not leave the browser.
 * The value has to match an option of the `platform` dropdown in
 * .github/ISSUE_TEMPLATE/bug.yml (the platform labels in platforms.js).
 */
export function reportBugUrl(platformLabel) {
  return platformLabel ? `${LINKS.newBug}&platform=${encodeURIComponent(platformLabel)}` : LINKS.newBug;
}
