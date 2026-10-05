/**
 * Raw MiB sizing → Docker Compose `deploy.resources` memory limit and
 * reservation, plus the service-level `mem_limit` / `mem_reservation`
 * equivalent.
 *
 * `docker compose up` applies both: the limit is the container's hard memory
 * limit, the reservation its soft limit (Docker's `--memory-reservation`),
 * enforced only when the host runs short of memory. In Swarm the reservation
 * is also what nodes are scheduled by. Values round up to a whole M, which
 * Docker reads as MiB. Docker rejects a limit below the reservation or below
 * 6 MiB, so the limit is raised to whichever applies.
 *
 * The method, sources and assumptions are on /docker-compose/how-it-works/.
 */
import { roundUpToMultiple } from '../calculator.js';
import { marginTip, mib, percent, pluralize } from './shared.js';

// How the shared fields move this result (see ../field-tip-texts.js for the defaults).
export const fieldTips = {
  avg: 'The reservation is this plus the request margin.',
  peak: 'The limit is this plus the limit margin, raised to the reservation if it would fall below it.',
  requestMargin: marginTip('the reservation is the average plus it'),
  limitMargin: marginTip('the limit is the peak plus it')
};

// Docker reads M as MiB and takes whole values; the output uses whole M.
export const ROUNDING_STEP_MIB = 1;
// The smallest memory limit Docker accepts (6 MiB).
export const MIN_LIMIT_MIB = 6;

const NOTE =
  'With docker compose up the reservation is a soft limit, enforced only when the host runs short of memory; ' +
  'Swarm also uses it to choose a node. If the host has swap, the container can use as much swap as its limit ' +
  'unless memswap_limit equals the limit.';

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

export function serviceLevelSnippet(reservation, limit) {
  return [`mem_limit: ${limit}M`, `mem_reservation: ${reservation}M`].join('\n');
}

function explainSteps(raw, reservation, limit, totalReservation, raisedTo) {
  const fromPeak = `${mib(raw.peakMiB)} peak + ${percent(raw.limitMarginPct)} = ${mib(raw.limitMiB)}`;
  return [
    { label: 'Reservation', text: `${mib(raw.averageMiB)} average + ${percent(raw.requestMarginPct)} = ${mib(raw.requestMiB)} → ${reservation}M` },
    {
      label: 'Limit',
      text:
        raisedTo === 'reservation'
          ? `${fromPeak}, raised to the reservation → ${limit}M`
          : raisedTo === 'minimum'
            ? `${fromPeak}, raised to Docker’s ${MIN_LIMIT_MIB}M minimum → ${limit}M`
            : `${fromPeak} → ${limit}M`
    },
    { label: 'Total reservation', text: `${reservation}M × ${pluralize(raw.replicas, 'replica')} = ${totalReservation}M` }
  ];
}

/** @param {object} raw - result of calculateRawSizing() */
export function format(raw) {
  const reservation = roundUpToMultiple(raw.requestMiB, ROUNDING_STEP_MIB);
  const peakBasedLimit = roundUpToMultiple(raw.limitMiB, ROUNDING_STEP_MIB);
  // Docker rejects a limit below the reservation, or below 6 MiB. With steady
  // workloads (peak ≈ average) the average-based reservation margin can outgrow
  // the peak-based limit margin, so lift the limit to the reservation.
  const limit = Math.max(peakBasedLimit, reservation, MIN_LIMIT_MIB);
  const raisedTo = limit === peakBasedLimit ? null : limit === reservation ? 'reservation' : 'minimum';
  const totalReservation = reservation * raw.replicas;

  const warnings = [...raw.warnings];
  if (raisedTo === 'reservation') {
    warnings.push({
      level: 'warning',
      code: 'limit-raised-to-reservation',
      message:
        `Peak is close to average, so the peak-based limit (${peakBasedLimit}M) fell below the reservation. ` +
        `The limit was raised to ${limit}M because Docker rejects a limit below the reservation.`
    });
  }

  const steps = explainSteps(raw, reservation, limit, totalReservation, raisedTo);
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
    alternative: { label: 'Service-level equivalent (use one or the other)', code: serviceLevelSnippet(reservation, limit) },
    warnings,
    explanationSteps: steps,
    explanation: steps.map((step) => `${step.label}: ${step.text}.`).join(' '),
    note: NOTE
  };
}
