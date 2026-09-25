# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

MemoryLimit has made several choices that look odd without their reasons: no framework, no bundler, HTML
pages kept partly by a script, a policy header that allows `'unsafe-inline'` styles but not scripts. The
code shows *what* was chosen. It doesn't show *why*, or which alternatives were rejected. Without that, a
future change can undo a decision without knowing what it was protecting.

## Decision

Keep Architecture Decision Records in `docs/adr/`, one Markdown file per decision, numbered and never
renumbered. Each record states its context, the decision, its consequences and the alternatives considered.
Accepted records are not edited to change their outcome; a new record supersedes them.

## Consequences

- The reasons behind the architecture are reviewable next to the code, and go through the same pull requests.
- Records 0001–0010 were written after the fact, so they describe the reasoning as it was understood then.
- Keeping them current is a manual discipline: nothing fails when a decision changes without a new record.
