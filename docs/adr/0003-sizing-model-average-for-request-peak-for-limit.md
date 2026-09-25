# 3. Sizing model: average for the request, peak for the limit

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Memory settings usually come in pairs with different jobs. A *request* or *reservation* is what the scheduler
guarantees and bin-packs on. A *limit* or *max* is where the process is throttled or OOM-killed. Sizing both
from one number either wastes capacity (everything sized for the peak) or causes OOM kills (everything sized
for the average). How much headroom is right also depends on how the workload behaves and how much an outage
matters.

## Decision

[`calculateRawSizing()`](../../public/js/calculator.js) computes, in unrounded MiB:

- **request = average × (1 + request margin)**, and
- **limit = peak × (1 + limit margin)**.

Each margin is a base percentage from the chosen sensitivity, plus a workload adjustment, scaled by an
environment multiplier. The workload adjustment adds headroom for JVMs and caches, and a wider gap for workers,
whose memory is spiky. The multiplier is lower for development and staging. The table of values is in the
[README](../../README.md#how-the-sizing-works).

The model is deliberately transparent rather than statistical. Every figure comes with a plain-English
explanation of how it was reached.

Invalid input throws a `RangeError` instead of being coerced. A peak below the average is still computed, but
returns an error-level warning, because it usually means the wrong series was pasted.

## Alternatives considered

- **Percentiles (p95/p99) instead of average and peak.** More robust to outliers, but people paste as few as
  one or two samples, and exports rarely have enough points for a meaningful p99. Average and maximum work for
  any input size and are easy to explain.
- **One margin applied to both values.** Simpler, but it can't express that a worker needs little guaranteed
  memory and a lot of burst room.

## Consequences

- Platforms with a single setting (Lambda, Cloud Run, Redis) use only the peak-based value, because running
  out there is a hard failure.
- The margin tables are opinionated defaults, not measured truths. Changing them changes every platform's
  output, so they are pinned by unit tests.
- Floating-point results such as 200 × 1.12 = 224.00000000000003 would round up a whole step. Rounding
  therefore uses a small tolerance (`FLOAT_TOLERANCE = 1e-9`).
