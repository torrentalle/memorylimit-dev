# 13. Explain each calculator with a sourced guide page

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

A calculator's result is only useful if the reader can check it. The one-paragraph "How this was derived" text
mixed the arithmetic with platform rules and our own defaults, and never said which was which. Couchbase
([ADR 0012](0012-couchbase-sizing-from-buckets-and-service-quotas.md)) introduced a separate page explaining its
method, with vendor documentation cited and our own choices marked. Every other calculator needs the same, and
eleven of them written by different hands will drift apart unless the format is fixed.

Most numbers in the output are one of three kinds:

- **Documented:** a vendor rule, limit, unit or formula, such as Kubernetes rejecting a request above its limit.
- **Assumption:** a choice the documentation doesn't make for us, such as the margins of
  [ADR 0003](0003-sizing-model-average-for-request-peak-for-limit.md) or a warning threshold.
- **Obvious:** unit conversions, sums, rounding up to the unit the platform accepts. These need no label.

## Decision

Every calculator gets the same three layers of explanation.

1. **Result block ("How this was derived").** The formatter returns `explanationSteps` (`[{ label, text }]`):
   about three short steps, one value per line, with the real numbers. It also returns a `note` of at most three
   short sentences, for what the reader must know before applying the result. Details go to the guide.
2. **Guide page.** It lives at `/<platform>/how-it-works/` and is registered with the platform's `guide` field in
   `platforms.js`. `sync:pages` links it from the result block (new tab) and the sitemap lists it. Until a
   platform has one, the link goes to `/sizing-model/`, the page explaining the shared model. Sections are
   numbered panels, in this order where they apply:
   - what the platform's memory settings do;
   - each calculation step, with a worked example;
   - every warning, when it shows and its basis;
   - how the result compares with the vendor's own sizing guidance or tool, when there is one;
   - what to paste;
   - all assumptions in one table (assumption, kind, why, what happens if it doesn't hold), with
     `id="assumptions"`. The kind is one of **Our default** (a value we chose), **Our reading** (how we read
     documentation that isn't explicit) or **About your setup** (something we take for granted about the user's
     data or cluster);
   - references.

   Pages that use the average/peak model link `/sizing-model/` instead of repeating it.
3. **Field tooltips.** A "?" next to each field that changes the result says in one sentence how. Fields that
   don't change it get none. Several fields that would say the same share one hint at the top of their section.
   Shared fields have defaults in `field-tip-texts.js`; a formatter overrides them with `fieldTips`.

**Source labels** go at the end of the sentence they back, as small links:

- `<a class="guide-tag guide-tag--doc" href="…">Kubernetes docs</a>` links the vendor document that says it;
- `<a class="guide-tag guide-tag--assumption" href="#assumptions">Assumption</a>` links the page's table.

Obvious calculations carry no label. A constant with no documentation behind it is raised with the maintainer
before it ships: it gets a documented value, becomes a labelled assumption, or is dropped. Every command, flag,
unit and metric name in the output and the paste hints is checked against the vendor's documentation, not
written from memory.

**Tests keep the pages honest.** The numbers in the guide's worked examples come from running the formatter, and
the page marks them with `data-example` (the inputs) and `data-check` (which result field). The platform's
formatter test recomputes them. `tests/pages.test.js` checks every guide's labels: doc labels link to an
`https://` document, assumption labels to `#assumptions`.

## Alternatives considered

- **Everything in the result block.** No extra page, but the block becomes a wall of text and the sources
  don't fit.
- **One long page for all platforms.** One place to look, but readers come for one platform and the page would
  be mostly irrelevant to them.
- **One inline label per kind of assumption.** More precise in the text, but three more labels make it noisy
  again. The kind lives in the table instead, one click away.
- **Labels at the start of the sentence.** That was the first version. They dominated the text, and readers had
  to look elsewhere for the source.

## Consequences

- Adding or reviewing a platform means writing its guide, its `explanationSteps` and its `fieldTips` too. In
  return, the review leaves a record of what was checked against which document.
- When a vendor changes a rule, its guide and the formatter test have to change with it. The test fails if the
  guide's numbers drift from the code. The sources themselves aren't monitored.
- The README's platform table stays a one-line summary per platform and links each guide.
