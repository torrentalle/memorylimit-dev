/**
 * Raw MiB sizing → Docker Compose `deploy.resources` block, plus the
 * single-value `mem_limit` equivalent for Compose without Swarm support.
 */
import { roundUpToMultiple } from '../calculator.js';
import { describeProfile, percent, pluralize } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'The reservation is this plus the request margin.',
  peak: 'The limit is this plus the limit margin, raised to the reservation if it would fall below it.'
};

export const STEP_MIB = 10;

export function generateYaml(reservation, limit) {
  return [
    'deploy:',
    '  resources:',
    '    limits:',
    `      memory: ${limit}M`,
    '    reservations:',
    `      memory: ${reservation}M`
  ].join('\n');
}

export function legacySnippet(limit) {
  return `mem_limit: ${limit}m`;
}

function explain(raw, reservation, limit, limitRaised) {
  return (
    `Reservation = ${Math.round(raw.averageMiB)}MiB average + ${percent(raw.requestMarginPct)} margin ` +
    `(${describeProfile(raw)}) → rounded up to ${reservation}M; ` +
    `limit = ${Math.round(raw.peakMiB)}MiB peak + ${percent(raw.limitMarginPct)} margin` +
    (limitRaised ? `, raised to match the reservation → ${limit}M.` : ` → rounded up to ${limit}M.`)
  );
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const reservation = roundUpToMultiple(raw.requestMiB, STEP_MIB);
  const peakBasedLimit = roundUpToMultiple(raw.limitMiB, STEP_MIB);
  // Docker rejects a reservation above the limit. With steady workloads
  // (peak ≈ average) the average-based reservation margin can outgrow the
  // peak-based limit margin, so lift the limit to the reservation.
  const limit = Math.max(peakBasedLimit, reservation);
  const limitRaised = limit > peakBasedLimit;
  const totalReservation = reservation * raw.replicas;

  const warnings = [...raw.warnings];
  if (limitRaised) {
    warnings.push({
      level: 'warning',
      code: 'limit-raised-to-reservation',
      message:
        `Peak is close to average, so the peak-based limit (${peakBasedLimit}M) fell below the reservation. ` +
        `The limit was raised to ${limit}M because Docker rejects a reservation above the limit.`
    });
  }

  return {
    platform: 'dockerCompose',
    reservation,
    limit,
    totalReservation,
    figures: [
      { role: 'request', label: 'Reservation', text: `${reservation}M`, detail: 'per replica' },
      { role: 'limit', label: 'Limit', text: `${limit}M`, detail: 'per replica' },
      { role: 'total', label: 'Total reservation', text: `${totalReservation}M`, detail: `across ${pluralize(raw.replicas, 'replica')}` }
    ],
    markers: [
      { role: 'request', name: 'reservation', value: reservation, text: `${reservation}M` },
      { role: 'limit', name: 'limit', value: limit, text: `${limit}M` }
    ],
    snippet: { label: 'docker-compose.yml', language: 'yaml', code: generateYaml(reservation, limit) },
    alternative: { label: 'Compose without Swarm deploy support', code: legacySnippet(limit) },
    warnings,
    explanation: explain(raw, reservation, limit, limitRaised),
    note: null
  };
}
