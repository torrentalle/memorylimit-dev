# AWS Lambda Memory Size Calculator

Canonical: [AWS Lambda Memory Size Calculator](https://memorylimit.dev/lambda/)

Locale: en

Purpose: Find the right AWS Lambda MemorySize for your function. Balance cost per invocation against execution duration, sized from peak usage rather than average.

Content updated: 2026-10-06

Source revision: main@b4e7405 + seo/meta-and-schema

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/serverless.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

Lambda has no separate memory request and limit — one `MemorySize` value sets your function's memory, its proportional vCPU allocation, and its per-millisecond cost all at once. Running out causes a hard failure rather than graceful throttling, so this calculator sizes memory from peak usage, not average, and flags anything outside AWS's 128–10240 MB range.

## Usage data

Paste box: Max Memory Used samples.

**Where do I get these numbers?**

Run this in CloudWatch Logs Insights against the function's log group over a representative period, then export the results as CSV and paste them:

```
fields @maxMemoryUsed
| filter @type = "REPORT"
```

Each `REPORT` line is one invocation, and each value the most it used, in bytes. Prometheus output and plain lists of numbers work too.

Enter observed usage directly, in MiB.

- **Average usage** (MiB)
- **Peak usage** (MiB)

## Workload profile

- **Workload type**: API service; Worker / batch; Cache; JVM; Node.js; Python; Generic
- **OOM sensitivity**: Low — tolerate occasional out-of-memory errors; Medium; High — avoid out-of-memory errors at all cost
- **Environment**: Development; Staging; Production

**Advanced: margins and defaults**

Values the result relies on that are our own defaults, or vendor defaults your setup may change. Each “?” says how one moves the result; the guide says where it comes from.

- **Limit margin** (%)

## What you get

- Lambda function configuration
- How this was derived

The calculator shows the result and a step-by-step derivation after you enter usage data. Everything is calculated in your browser; nothing you enter is sent anywhere.

How every number is calculated, with sources and assumptions: [guide](https://memorylimit.dev/lambda/how-it-works/index.md). Wrong result? [Report it](https://github.com/torrentalle/memorylimit-dev/issues/new/choose).
