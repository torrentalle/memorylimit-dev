# 14. Let users change the values we assumed

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Every result rests on values that aren't the user's input: the margins of
[ADR 0003](0003-sizing-model-average-for-request-peak-for-limit.md), which are our own defaults, and per-platform
values such as systemd's `MemoryMax` ratio, Redis's provisioning factor, the Vertical Pod Autoscaler's recommender
defaults or Couchbase's high-water mark. [ADR 0013](0013-explain-each-calculator-with-sourced-guides.md) made the
guides list them, marked as assumptions or cited as vendor defaults, but a user whose setup differs (a tuned VPA, a
Redis without persistence, a team policy on headroom) could only correct the result by hand.

## Decision

Every calculator has a section **Advanced: margins and defaults** (on Couchbase, **Advanced: sizing defaults and
thresholds**), a `<details>` closed by default, below the inputs. It holds:

- On the ten calculators of the shared model, a **request margin** and a **limit margin** (0–200%). Left empty, each
  shows the margin the profile gives as its placeholder; a value replaces it (`calculateRawSizing({ requestMargin,
  limitMargin })`). Calculators sized from the peak alone show only the limit margin.
- The platform's own values, when it has any that are our choice or a vendor default the user's setup can change.
  Values a vendor fixes (minimums, unit sizes, CPU tiers) stay fixed.

Each field follows the rules of the other fields: its HTML default is the value we assume, it has a "?" tooltip of
one sentence saying how it moves the result, and the formatter takes it as an option with that default
(`data-formatter-option`; `data-unit="percent"` sends a fraction). A value outside the field's `min`/`max` is used at
the nearest end, and the field's border says so. The summary counts the values changed, so a closed section still
shows that the result isn't the default one, and **Reset to defaults** puts them back. Each guide lists its values,
defaults, ranges and sources in a **Values you can change** table under its assumptions.

## Consequences

- Assumptions are still documented as assumptions; the section doesn't make them less ours, it lets the user
  replace them.
- The results with every field at its default are unchanged, so the guides' worked examples still hold.
- A new platform-specific value needs a formatter option with a default, a field with that default, a tooltip and a
  row in its guide's table.
