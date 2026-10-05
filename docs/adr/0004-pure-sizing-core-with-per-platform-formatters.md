# 4. Pure sizing core with one formatter per platform

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

MemoryLimit started as a Kubernetes-only calculator and grew to nine platforms. The platforms share the same
question (how much memory, with how much headroom), but each answers it with its own rules:

- **Units and rounding steps:** Kubernetes `Mi` rounded to 32/64, Docker `M` rounded to 10, vSphere in
  128/256 MB steps.
- **Value ranges:** Lambda allows 128–10240 MB, and Cloud Run needs a minimum vCPU above 4 GiB.
- **Ordering constraints:** Docker, vSphere and Proxmox reject a reservation greater than the limit.
- **Output formats:** YAML, HCL, unit files, CLI commands.

If that logic were mixed into DOM code, each new platform would mean editing the UI and could only be tested
in a browser.

## Decision

Split the code into a pure core and a thin shell:

- `calculator.js` ([ADR 0003](0003-sizing-model-average-for-request-peak-for-limit.md)) and
  `prometheus-parser.js` are platform-agnostic and have no DOM access.
- Each platform has a formatter in `public/js/formatters/<name>.js` with one function:
  `format(raw, options)`. It applies that platform's rounding, clamping and ordering rules. It returns plain
  data:
  - figures;
  - gauge markers, tagged with a *role* such as `request` or `limit` rather than a CSS class;
  - the snippet and an optional alternative form;
  - warnings with stable codes;
  - an explanation and a note.
- `app.js` is the only module that touches the calculator page's DOM. It maps that data onto the page the
  same way for every platform.
- `platforms.js` is the single registry of platforms: id, label, path and tagline, plus `ENABLED_PLATFORMS`.

## Alternatives considered

- **One formatter with a `switch` on the platform.** Less boilerplate at first, but every platform's rules
  would share one file and one test surface, and every page would download all of them.
- **Formatters that return HTML.** Simpler for `app.js`, but it couples every formatter to the markup and
  styles, and it makes their output harder to assert on in tests.

## Consequences

- Adding a platform takes a formatter, a page and a registry entry. `app.js` doesn't change (see the README's
  "Adding a platform").
- Formatters and the core are unit-tested in Node without a browser, including invariants such as "the lower
  setting never exceeds the upper one".
- The same modules could run on a server or in a CLI without changes.
- All formatters must return the same shape. Nothing enforces that beyond the tests and copying an existing
  formatter.

## Update

Two details above have changed. Every formatter now rounds up to the platform's smallest accepted unit (whole
Mi, M, MB or MiB; a multiple of 4 MB for a vSphere VM's memory) instead of coarse steps, so the rounding steps
named in the context are out of date. And `app.js` is no longer the only module that touches a calculator
page's DOM: Couchbase has its own page script ([ADR 0012](0012-couchbase-sizing-from-buckets-and-service-quotas.md)),
and the "Advanced" section has `advanced-settings.js` ([ADR 0014](0014-let-users-change-assumed-values.md)). The
core and the formatters stay free of the DOM.
