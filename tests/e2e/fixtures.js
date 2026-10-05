import { test as base, expect } from '@playwright/test';

export { expect };

// Calculator pages load their formatter with a dynamic import, which the
// window `load` event doesn't wait for. This `page.goto` also waits until
// js/calculator-page.js marks the page ready, so tests never type into a
// calculator that isn't listening yet. Other pages return straight away.
//
// Uncaught page errors are collected and checked when the test ends, so a
// script error fails the test it happened in (throwing from the event
// listener would surface outside the test instead).
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.waitForFunction(
        () => !document.body?.dataset.platform || 'calculatorReady' in document.documentElement.dataset
      );
      return response;
    };
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await use(page);
    expect(pageErrors, 'uncaught errors on the page').toEqual([]);
  }
});
