# How the AWS Lambda calculator works

Canonical: [How the AWS Lambda calculator works](https://memorylimit.dev/lambda/how-it-works/)

Locale: en

Purpose: How the Lambda calculator sets MemorySize: why it's peak-based, the MiB to MB conversion, Lambda's range, and how CPU and cost follow memory, with docs links.

Content updated: 2026-10-06

Source revision: main@b4e7405 + seo/meta-and-schema

Maintenance owner: MemoryLimit maintainers (github.com/torrentalle/memorylimit-dev)

[Topic map](https://memorylimit.dev/llm/topics/guides.md) · [Complete scoped map](https://memorylimit.dev/sitemap.md)

[← AWS Lambda memory size calculator](https://memorylimit.dev/lambda/index.md)


This page walks through how the [Lambda calculator](https://memorylimit.dev/lambda/index.md) turns your usage data into a function's `MemorySize`. It starts from the peak side of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md); this page covers what happens after that. Statements backed by AWS's documentation end with an AWS docs link to it. Choices the documentation doesn't make for us are explained and marked Assumption, which links to its row in the table of all of them.

## What MemorySize does

- It is the memory available to the function at runtime, from 128 MB to 10,240 MB in 1 MB steps. [AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html)
- Lambda allocates CPU in proportion to it: at 1,769 MB a function has the equivalent of one vCPU. [AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html)
- The duration cost depends on it too: the price per millisecond grows with the memory allocated. [AWS pricing](https://aws.amazon.com/lambda/pricing/)

There is no separate reservation and limit, and running out of memory fails the invocation, so the calculator sizes `MemorySize` from the peak alone. The average you enter doesn't change the result.

## From peak usage to MemorySize

```
memory     = peak × (1 + limit margin)                       in MiB
MemorySize = memory × 1,048,576 ÷ 1,000,000                   in MB, rounded up to a whole MB
           kept within 128–10,240 MB
```

The limit margin comes from the sensitivity, workload type and environment you choose; the [sizing model](https://memorylimit.dev/sizing-model/index.md) explains it, and it's an assumption too.

AWS's own Logs Insights queries turn Lambda's memory figures into MB by dividing the bytes by 1000 twice, so Lambda's MB are decimal megabytes: 1 MiB is 1.048576 MB. [AWS docs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html) The documentation never defines the unit outright, so this is how we read it. [Assumption](#all-assumptions-in-one-place)

### Worked example

Peak 630 MiB, generic workload, medium sensitivity, production:

| memory | 630 MiB × 1.30 | 819 MiB |
| --- | --- | --- |
| in MB | 819 × 1.048576 = 858.8 | 859 MB |
| CPU | 859 ÷ 1,769 | ≈ 0.49 vCPU |

A small function, peaking at 60 MiB, lands below Lambda's minimum and is raised to it:

| in MB | 60 MiB × 1.30 = 78 MiB = 81.8 MB, below 128 | 128 MB |
| --- | --- | --- |

## Memory, CPU and cost

Because CPU comes with memory, AWS calls memory the principal lever for a function's performance: a CPU-, network- or memory-bound function can run much faster with more. AWS suggests watching memory and duration in CloudWatch, trying the open-source Lambda Power Tuning tool, or accepting Compute Optimizer's recommendations. [AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html)

This calculator only answers the memory question: how much the function needs so it doesn't run out. It doesn't measure duration, so it can't tell whether more memory would make a function faster or cheaper; run Power Tuning for that. [Assumption](#all-assumptions-in-one-place)

## What the calculator writes

```
{ "MemorySize": 859 }

aws lambda update-function-configuration --function-name <function> --memory-size 859
```

`MemorySize` is the property name in AWS SAM templates, and `update-function-configuration` with `--function-name` and `--memory-size` is the CLI command AWS documents for changing it. [AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html)

## Every warning, and why

| Message about | Shown when | Basis |
| --- | --- | --- |
| Outside Lambda's range warning | The result is below 128 MB or above 10,240 MB | Lambda only accepts that range. [AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html) |
| Peak below average error | The peak you entered is lower than the average | Impossible with real samples; it usually means two different series. See the [sizing model](https://memorylimit.dev/sizing-model/index.md#average-and-peak). |

## What to paste

```
fields @maxMemoryUsed
| filter @type = "REPORT"
```

- Run it in CloudWatch Logs Insights on the function's log group. Lambda's `REPORT` lines, one per invocation, carry the discovered fields `@maxMemoryUsed` and `@memorySize`. [AWS docs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData-discoverable-fields.html) AWS's sample query divides them by 1000 twice to get MB, so they are bytes, and the calculator reads them as such. [AWS docs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html)
- Each value is the most one invocation used, so the calculator's "average" is the average of those maximums and its peak the largest of them. Only the peak sets the result. [Assumption](#all-assumptions-in-one-place)

## All assumptions in one place

Besides the margins of the [shared sizing model](https://memorylimit.dev/sizing-model/index.md#all-assumptions-in-one-place):

**Our default**: a value we chose. **Our reading**: how we read documentation that isn't explicit. **About your setup**: something we take for granted about your data or cluster.

| Assumption | Kind | Why | If it doesn't hold |
| --- | --- | --- | --- |
| Lambda's MB are decimal (1,000,000 bytes) | Our reading | AWS's sample queries divide by 1000 twice | If they were MiB, the result would be about 5% larger than needed. |
| Size for memory use only, not for speed or cost | Our default | The calculator sees memory, not duration | A CPU-bound function may be faster or cheaper with more memory; Power Tuning finds out. |
| Each sample is one invocation's maximum | About your setup | That's what `@maxMemoryUsed` holds | Pasting other figures, such as averages, hides the peak and gives too small a result. |

### Values you can change

The calculator’s **Advanced: margins and defaults** section, closed by default, lets you replace these values when your setup differs. Each field’s “?” says how it moves the result; a value outside the range is used at its nearest end, and “Reset to defaults” puts them all back.

| Value | Default | Range | Where the default comes from |
| --- | --- | --- | --- |
| Limit margin | from the profile | 0–200% | MemoryLimit’s default, from sensitivity, workload type and environment ([sizing model](https://memorylimit.dev/sizing-model/index.md#the-margins)); sizes `MemorySize` |

## References

- [Configure Lambda function memory](https://docs.aws.amazon.com/lambda/latest/dg/configuration-memory.html) — the range, CPU per MB, how to choose, the CLI command.
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/) — duration cost depends on memory.
- [CloudWatch Logs Insights sample queries](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax-examples.html) — the Lambda memory query and its MB conversion.
- [Discovered fields](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_AnalyzeLogData-discoverable-fields.html) — `@maxMemoryUsed` and `@memorySize`.
- [AWS Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning) — measuring speed and cost at different memory sizes.

[← Back to the Lambda calculator](https://memorylimit.dev/lambda/index.md)
