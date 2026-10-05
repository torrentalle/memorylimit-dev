/**
 * Turns pasted monitoring output into memory samples.
 *
 * Understands:
 *   - Prometheus / OpenMetrics exposition lines: `name{labels} value [timestamp]`
 *     (including exemplars and metric names containing digits, e.g. `k8s_*`)
 *   - Prometheus UI range-query tables: `value @timestamp`
 *   - Prometheus HTTP API JSON (`/api/v1/query` and `/api/v1/query_range`)
 *   - `[timestamp, "value"]` pairs copied out of that JSON
 *   - Grafana CSV exports (date or epoch-millisecond time column)
 *   - Values with byte units (`412 MiB`, `1.21 GiB`, `412Mi` from `kubectl top`)
 *   - Plain lists of numbers, one per line or comma/space separated
 *
 * Series for the pod-level cgroup (`container=""`) and the pause container
 * (`container="POD"`) are skipped: cAdvisor exports them next to the real
 * containers, and averaging them in skews the result.
 */

export const BYTES_IN_MIB = 1024 * 1024;
// If every unitless sample is below this, they're too small to plausibly
// be byte counts of a container's memory, so treat them as MiB.
export const IMPLAUSIBLE_BYTES_THRESHOLD = 1_000_000;

const UNIT_BYTES = {
  B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12,
  KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776,
  Ki: 1024, Mi: 1048576, Gi: 1073741824, Ti: 1099511627776
};

const NUMBER_SRC = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?';
const NUMBER_ONLY = new RegExp(`^${NUMBER_SRC}$`);
const METRIC_NAME = /^[A-Za-z_:][A-Za-z0-9_:]*/;
const LABEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
// A standalone number: not part of an identifier (`k8s`), a date
// (`2026-09-25`), a time (`10:00`), a path, or an `@timestamp`.
const ROW_VALUE = new RegExp(
  `(?<![\\w.:/@-])(${NUMBER_SRC})\\s?(${Object.keys(UNIT_BYTES).join('|')})?(?![\\w.:/-])`,
  'g'
);
const JSON_PAIR = new RegExp(`^\\[\\s*(${NUMBER_SRC})\\s*,\\s*"?(${NUMBER_SRC})"?\\s*\\],?$`);
// `used_memory:419430400` (Redis INFO) or `MemoryCurrent=412345678` (systemctl show).
// Checked before exposition parsing because `:` is legal in Prometheus names.
const KEY_VALUE = new RegExp(`^([A-Za-z_][\\w.-]*)\\s*[:=]\\s*(${NUMBER_SRC})\\s?(${Object.keys(UNIT_BYTES).join('|')})?$`);
// The keys whose values are memory usage. When a paste mixes them with other keys — the whole of
// `redis-cli INFO memory` rather than its used_memory lines — only these are read.
const MEMORY_KEYS = new Set(['used_memory', 'MemoryCurrent']);
// A date (2026-09-25) or a time of day (10:00) in a row means the row's time is already written out,
// so its first number is a sample, not an epoch timestamp.
const DATE_OR_TIME = /\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\b/;

const isEpochMs = (v) => v >= 1e12 && v < 1e13;
const isEpochSeconds = (v) => v >= 1e9 && v < 1e10;
const isUsable = (v) => v !== null && Number.isFinite(v) && v >= 0;
const isTimestampToken = (t) => t.unit === null && (isEpochMs(t.value) || isEpochSeconds(t.value));

function isPodLevelSeries(labels) {
  if (!labels || !Object.hasOwn(labels, 'container')) return false;
  return labels.container === '' || labels.container === 'POD';
}

/** Parses `{a="1",b="x}y"}` starting at line[start] === '{'. */
function readLabels(line, start) {
  const labels = {};
  let i = start + 1;
  while (i < line.length) {
    while (line[i] === ' ' || line[i] === ',') i++;
    if (line[i] === '}') return { labels, end: i + 1 };

    const nameMatch = LABEL_NAME.exec(line.slice(i));
    if (!nameMatch) return null;
    const name = nameMatch[0];
    i += name.length;
    while (line[i] === ' ') i++;
    if (line[i] !== '=') return null;
    i++;
    while (line[i] === ' ') i++;
    if (line[i] !== '"') return null;
    i++;

    let value = '';
    while (i < line.length && line[i] !== '"') {
      if (line[i] === '\\' && i + 1 < line.length) {
        value += line[i + 1] === 'n' ? '\n' : line[i + 1];
        i += 2;
      } else {
        value += line[i];
        i++;
      }
    }
    if (i >= line.length) return null;
    i++;
    labels[name] = value;
  }
  return null;
}

function parseExpositionValue(token) {
  if (token === 'NaN' || /^[-+]?Inf$/.test(token)) return NaN;
  return NUMBER_ONLY.test(token) ? parseFloat(token) : null;
}

/**
 * Returns { labels, values } for a Prometheus/OpenMetrics line, or null if
 * the line isn't shaped like one (so it gets parsed as a table row).
 * `values` holds null for tokens that aren't numbers at all.
 */
function parseExpositionLine(line) {
  // Results of PromQL expressions (sums, subtractions, ...) have labels
  // but no metric name: `{instance="vm1:9100"} 419430400`.
  const nameMatch = METRIC_NAME.exec(line);
  if (!nameMatch && line[0] !== '{') return null;

  let i = nameMatch ? nameMatch[0].length : 0;
  let labels = {};
  if (line[i] === '{') {
    const parsed = readLabels(line, i);
    if (!parsed) return null;
    ({ labels } = parsed);
    i = parsed.end;
  }

  let rest = line.slice(i);
  if (rest !== '' && !/^\s/.test(rest)) return null;

  // Drop an OpenMetrics exemplar: `value ts # {trace_id="..."} 1 ts`.
  rest = rest.split(/\s#\s/)[0].trim();
  const tokens = rest === '' ? [] : rest.split(/\s+/);

  if (/(^|\s)@/.test(rest)) {
    // Prometheus UI range table on one line: `v1 @ts1 v2 @ts2 ...`.
    return { labels, values: tokens.filter((t) => !t.startsWith('@')).map(parseExpositionValue) };
  }
  // `value [timestamp]` — the second token is a timestamp, not a sample.
  return { labels, values: tokens.length > 0 ? [parseExpositionValue(tokens[0])] : [] };
}

function parseRow(line) {
  const pair = JSON_PAIR.exec(line);
  if (pair) return { tokens: [{ value: parseFloat(pair[2]), unit: null }], hasTimeColumn: false };

  const tokens = [...line.matchAll(ROW_VALUE)].map((m) => ({ value: parseFloat(m[1]), unit: m[2] ?? null }));
  // A Grafana CSV with a date column has its time there; a steadily growing first series in the
  // epoch-seconds range (1–9 GiB in bytes) must not then be mistaken for a time column.
  return { tokens, hasTimeColumn: !DATE_OR_TIME.test(line) };
}

/**
 * Decides whether the first column of multi-value rows is a time column
 * (Grafana CSV with epoch timestamps). Millisecond epochs are unambiguous
 * (1–10 TB is not a container's memory); second-resolution epochs overlap
 * plausible byte counts, so they also have to be strictly increasing.
 */
function firstColumnIsTimestamp(rows) {
  const firsts = rows.filter((row) => row.length >= 2).map((row) => row[0]);
  if (firsts.length === 0 || firsts.some((t) => t.unit !== null)) return false;

  const values = firsts.map((t) => t.value);
  if (values.every(isEpochMs)) return true;
  if (!values.every(isEpochSeconds)) return false;
  if (values.length === 1) return !Number.isInteger(values[0]);
  return values.every((v, i) => i === 0 || v > values[i - 1]);
}

function fromJson(json, out) {
  const pushPair = (pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return;
    const value = parseFloat(pair[1]);
    if (isUsable(value)) out.samples.push({ value, explicitBytes: false });
    else out.ignoredLines++;
  };

  const data = json?.data ?? json;
  if (data?.resultType === 'scalar' && Array.isArray(data.result)) {
    pushPair(data.result);
    return true;
  }
  if (Array.isArray(data?.result)) {
    for (const series of data.result) {
      if (isPodLevelSeries(series?.metric)) {
        out.skippedSeries++;
        continue;
      }
      if (Array.isArray(series?.value)) pushPair(series.value);
      if (Array.isArray(series?.values)) series.values.forEach(pushPair);
    }
    return true;
  }
  if (Array.isArray(json) && json.length > 0 && json.every((p) => Array.isArray(p) && p.length === 2)) {
    json.forEach(pushPair);
    return true;
  }
  return false;
}

/**
 * @param {string} text
 * @returns {{ samples: {value: number, explicitBytes: boolean}[], ignoredLines: number, skippedSeries: number }}
 *   `value` is in bytes when `explicitBytes` is true (it carried a unit);
 *   otherwise its unit is unknown and resolved later by detectUnit().
 */
export function extractSamples(text) {
  const out = { samples: [], ignoredLines: 0, skippedSeries: 0 };
  if (!text) return out;

  const trimmed = String(text).trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      if (fromJson(JSON.parse(trimmed), out)) return out;
    } catch {
      // Not a complete JSON document — fall through to line parsing.
    }
  }

  // Samples are resolved after the loop (table rows need the time-column
  // check across all rows first), so collect entries in input order.
  const entries = [];
  let skippingSeries = false;

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const keyValue = KEY_VALUE.exec(line);
    if (keyValue) {
      const [, key, number, unit] = keyValue;
      const value = parseFloat(number);
      if (!isUsable(value)) out.ignoredLines++;
      else entries.push({ key, sample: unit ? { value: value * UNIT_BYTES[unit], explicitBytes: true } : { value, explicitBytes: false } });
      continue;
    }

    const expo = parseExpositionLine(line);
    // `web 12m 412Mi` (kubectl top) looks like `name value` but its first
    // token isn't a number — treat those as table rows instead.
    if (expo && (expo.values.length === 0 || expo.values.some((v) => v !== null))) {
      const podLevel = isPodLevelSeries(expo.labels);
      // A header line with no value (Prometheus UI range table) applies to
      // the value rows that follow it.
      if (expo.values.length === 0) {
        skippingSeries = podLevel;
        if (podLevel) out.skippedSeries++;
        continue;
      }
      skippingSeries = false;
      if (podLevel) {
        out.skippedSeries++;
        continue;
      }
      const usable = expo.values.filter(isUsable);
      usable.forEach((value) => entries.push({ sample: { value, explicitBytes: false } }));
      if (usable.length === 0) out.ignoredLines++;
      continue;
    }

    if (skippingSeries) continue;

    const row = parseRow(line);
    const valid = row.tokens.filter((t) => isUsable(t.value));
    if (valid.length === 0) {
      if (/\d/.test(line)) out.ignoredLines++;
      continue;
    }
    entries.push({ row: { tokens: valid, hasTimeColumn: row.hasTimeColumn } });
  }

  const rows = entries.filter((e) => e.row).map((e) => e.row);
  const dropFirst = firstColumnIsTimestamp(rows.filter((r) => r.hasTimeColumn).map((r) => r.tokens));
  const keys = new Set(entries.filter((e) => e.key).map((e) => e.key));
  const onlyMemoryKeys = keys.size > 1 && [...keys].some((key) => MEMORY_KEYS.has(key));
  for (const { key, sample, row } of entries) {
    if (onlyMemoryKeys && key && !MEMORY_KEYS.has(key)) {
      out.ignoredLines++;
      continue;
    }
    if (sample) {
      out.samples.push(sample);
      continue;
    }
    // A row left with only its timestamp (an empty cell in a Grafana CSV, e.g. a gap in the series)
    // has no sample: counting the timestamp would add a value in the terabytes.
    if (dropFirst && row.hasTimeColumn && row.tokens.length === 1 && isTimestampToken(row.tokens[0])) {
      out.ignoredLines++;
      continue;
    }
    const values = dropFirst && row.hasTimeColumn && row.tokens.length >= 2 ? row.tokens.slice(1) : row.tokens;
    for (const { value, unit } of values) {
      out.samples.push(unit ? { value: value * UNIT_BYTES[unit], explicitBytes: true } : { value, explicitBytes: false });
    }
  }

  return out;
}

/** @returns {number[]} raw values (bytes when a unit was given, otherwise as written) */
export function parseSamples(text) {
  return extractSamples(text).samples.map((s) => s.value);
}

/**
 * @param {number[]} samples - unitless values
 * @returns {'bytes'|'mib'} best-guess unit for the sample set
 */
export function detectUnit(samples) {
  if (!samples || samples.length === 0) return 'bytes';
  return samples.every((v) => Math.abs(v) < IMPLAUSIBLE_BYTES_THRESHOLD) ? 'mib' : 'bytes';
}

export function bytesToMiB(bytes) {
  return bytes / BYTES_IN_MIB;
}

/** Parse pasted text and reduce it to average/peak usage in MiB. */
export function parseAndAnalyze(text) {
  const { samples, ignoredLines, skippedSeries } = extractSamples(text);
  const base = { ignoredLines, skippedSeries };

  if (samples.length === 0) {
    return { ...base, samples: [], count: 0, unit: null, valuesMiB: [], averageMiB: null, peakMiB: null };
  }

  const unitless = samples.filter((s) => !s.explicitBytes).map((s) => s.value);
  const unit = unitless.length === 0 ? 'bytes' : detectUnit(unitless);
  const valuesMiB = samples.map((s) => (s.explicitBytes || unit === 'bytes' ? bytesToMiB(s.value) : s.value));

  return {
    ...base,
    samples: samples.map((s) => s.value),
    count: valuesMiB.length,
    unit,
    valuesMiB,
    averageMiB: valuesMiB.reduce((sum, v) => sum + v, 0) / valuesMiB.length,
    // reduce rather than Math.max(...values): long range queries can exceed
    // the engine's argument-count limit.
    peakMiB: valuesMiB.reduce((max, v) => (v > max ? v : max), -Infinity)
  };
}
