/**
 * StadiumPilot Decision Engine
 * Pure, dependency-free functions that model the "smart assistant" logic.
 * Kept separate from DOM code so it can be unit tested in isolation (Node test runner).
 */

export const GATES = [
  { id: "G1", name: "Gate 1 – North Concourse", stands: ["A", "B"], wheelchair: true,  baseWalk: 4 },
  { id: "G2", name: "Gate 2 – East Concourse",  stands: ["C", "D"], wheelchair: true,  baseWalk: 6 },
  { id: "G3", name: "Gate 3 – South Concourse", stands: ["E", "F"], wheelchair: false, baseWalk: 5 },
  { id: "G4", name: "Gate 4 – West Concourse",  stands: ["G", "H"], wheelchair: true,  baseWalk: 7 },
  { id: "G5", name: "Gate 5 – VIP / Overflow",  stands: ["A","B","C","D","E","F","G","H"], wheelchair: true, baseWalk: 9 },
];

const PRE_MATCH_RAMP_MINUTES = 60; // density ramps up steadily in this window before kickoff
const POST_MATCH_SURGE_MINUTES = 20; // density spikes then decays in this window after full time
const FAR_OUT_DECAY_RATE = 5; // minutes per density point once well outside the ramp window
const FAR_OUT_MIN_DENSITY = 10; // density never drops below this floor long before kickoff
const DEEP_POST_MATCH_BASELINE = 20; // baseline once the post-match surge has fully cleared
const JITTER_RANGE = 15; // spread of the deterministic per-gate jitter
const JITTER_CENTER_OFFSET = 7; // centers the jitter roughly around zero

/**
 * Deterministic pseudo-random crowd density per gate based on a "time to kickoff"
 * value (minutes). Density rises sharply in the last 60 minutes before kickoff and
 * during the ~20 minutes after full time. Deterministic so it's testable.
 * @param {string} gateId
 * @param {number} minutesToKickoff - negative values mean "minutes after final whistle"
 * @returns {number} 0-100 density score
 */
export function crowdDensity(gateId, minutesToKickoff) {
  const seed = gateId.charCodeAt(1) || 1;
  let base;
  if (minutesToKickoff <= -1 && minutesToKickoff >= -POST_MATCH_SURGE_MINUTES) {
    base = 90 - Math.abs(minutesToKickoff) * 1.5; // post-match surge, decaying
  } else if (minutesToKickoff >= 0 && minutesToKickoff <= PRE_MATCH_RAMP_MINUTES) {
    base = 90 - minutesToKickoff; // pre-match ramp-up
  } else if (minutesToKickoff > PRE_MATCH_RAMP_MINUTES) {
    base = Math.max(FAR_OUT_MIN_DENSITY, 30 - (minutesToKickoff - PRE_MATCH_RAMP_MINUTES) / FAR_OUT_DECAY_RATE);
  } else {
    base = DEEP_POST_MATCH_BASELINE; // deep post-match, mostly cleared
  }
  const jitter = (seed * 7) % JITTER_RANGE;
  return Math.max(0, Math.min(100, Math.round(base + jitter - JITTER_CENTER_OFFSET)));
}

const CRITICAL_THRESHOLD = 75;
const HIGH_THRESHOLD = 50;
const MODERATE_THRESHOLD = 25;
const MAX_CONGESTION_WALK_PENALTY_MIN = 4; // extra minutes added at 100% density

/** @param {number} score 0-100 density @returns {'low'|'moderate'|'high'|'critical'} */
export function densityLabel(score) {
  if (score >= CRITICAL_THRESHOLD) return "critical";
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MODERATE_THRESHOLD) return "moderate";
  return "low";
}

const ACTION_KEY_BY_LABEL = {
  critical: "actionCritical",
  high: "actionHigh",
  moderate: "actionModerate",
  low: "actionLow",
};

/**
 * Transportation guidance, translated via i18n key. Bucketed by how much time
 * is left, since the best mode of arrival/departure changes as kickoff approaches.
 * @param {number} minutesToKickoff
 * @returns {string} i18n key
 */
export function transportAdviceKey(minutesToKickoff) {
  if (minutesToKickoff < 0) return "transportTipDeparture";
  if (minutesToKickoff > 45) return "transportTipEarly";
  if (minutesToKickoff >= 15) return "transportTipShuttle";
  return "transportTipWalkNow";
}

const SUSTAINABILITY_KEY_BY_GATE = {
  G1: "sustainabilityTipG1",
  G2: "sustainabilityTipG2",
  G3: "sustainabilityTipG3",
  G4: "sustainabilityTipG4",
  G5: "sustainabilityTipG5",
};

/**
 * Sustainability tip tied to the specific gate being recommended, so the advice
 * is contextual (transit line, recycling point, etc.) rather than generic.
 * @param {string} gateId
 * @returns {string} i18n key
 */
export function sustainabilityTipKey(gateId) {
  return SUSTAINABILITY_KEY_BY_GATE[gateId] || "sustainabilityTipG5";
}

/**
 * Recomputes the effective "minutes to kickoff" as real time passes, so the staff
 * dashboard can auto-refresh and show genuinely live-changing density/alerts
 * instead of a static snapshot. Pure function of elapsed time, so it stays testable.
 * @param {number} baseMinutesToKickoff - the value as of when the clock baseline was set
 * @param {number} elapsedMs - milliseconds since that baseline was set
 * @returns {number} updated minutes-to-kickoff
 */
export function effectiveMinutesToKickoff(baseMinutesToKickoff, elapsedMs) {
  const elapsedMinutes = elapsedMs / 60000;
  return baseMinutesToKickoff - elapsedMinutes;
}

/**
 * Core recommendation logic used by the fan-facing assistant.
 * @param {object} ctx
 * @param {string} ctx.stand - seating stand letter, e.g. "C"
 * @param {boolean} ctx.wheelchairAccess - accessibility requirement
 * @param {number} ctx.minutesToKickoff
 * @returns {{primary: object, alternate: object|null, reason: string, estWalkMinutes: number}}
 */
export function recommendRoute(ctx) {
  const { stand, wheelchairAccess, minutesToKickoff } = ctx;

  let candidates = GATES.filter((g) => g.stands.includes(stand));
  if (candidates.length === 0) candidates = [GATES[GATES.length - 1]]; // fallback to overflow gate

  if (wheelchairAccess) {
    const accessible = candidates.filter((g) => g.wheelchair);
    candidates = accessible.length > 0 ? accessible : [GATES.find((g) => g.wheelchair && g.id === "G5")];
  }

  const scored = candidates
    .map((g) => ({ gate: g, density: crowdDensity(g.id, minutesToKickoff) }))
    .sort((a, b) => a.density - b.density);

  const primary = scored[0];
  const overflowNeeded = densityLabel(primary.density) === "critical";

  let alternate = null;
  if (overflowNeeded) {
    const overflow = GATES.find((g) => g.id === "G5" && (!wheelchairAccess || g.wheelchair));
    if (overflow && overflow.id !== primary.gate.id) {
      alternate = { gate: overflow, density: crowdDensity(overflow.id, minutesToKickoff) };
    }
  }

  const reason = overflowNeeded
    ? "Primary gate is at critical density; overflow route suggested to reduce wait and crowding risk."
    : "Primary gate has acceptable density for your stand and access needs.";
  const reasonKey = overflowNeeded ? "reasonCritical" : "reasonOk";

  const walkPenalty = Math.round((primary.density / 100) * MAX_CONGESTION_WALK_PENALTY_MIN);
  const estWalkMinutes = primary.gate.baseWalk + walkPenalty;

  return {
    primary: { gate: primary.gate, density: primary.density, label: densityLabel(primary.density) },
    alternate: alternate
      ? { gate: alternate.gate, density: alternate.density, label: densityLabel(alternate.density) }
      : null,
    reason,
    reasonKey,
    estWalkMinutes,
    transportKey: transportAdviceKey(minutesToKickoff),
    sustainabilityKey: sustainabilityTipKey(primary.gate.id),
  };
}

/**
 * Aggregate, venue-wide summary for organizers: a single glanceable rollup of
 * gate health, rather than per-gate detail (which is what operationalAlerts() is for).
 * @param {number} minutesToKickoff
 * @returns {{averageDensity: number, criticalGateCount: number, totalGates: number, overallLabel: string}}
 */
export function organizerSummary(minutesToKickoff) {
  const densities = GATES.map((g) => crowdDensity(g.id, minutesToKickoff));
  const averageDensity = Math.round(densities.reduce((a, b) => a + b, 0) / densities.length);
  const criticalGateCount = densities.filter((d) => densityLabel(d) === "critical").length;
  return {
    averageDensity,
    criticalGateCount,
    totalGates: GATES.length,
    overallLabel: densityLabel(averageDensity),
  };
}

/**
 * Operational alert logic used by the volunteer/staff view.
 * @param {number} minutesToKickoff
 * @returns {Array<{gateId: string, level: string, action: string}>}
 */
export function operationalAlerts(minutesToKickoff) {
  return GATES.map((g) => {
    const density = crowdDensity(g.id, minutesToKickoff);
    const label = densityLabel(density);
    let action = "No action needed. Continue standard monitoring.";
    if (label === "critical") action = "Deploy additional staff and open overflow gate (G5) immediately.";
    else if (label === "high") action = "Monitor closely; prepare overflow gate on standby.";
    else if (label === "moderate") action = "Routine monitoring; recheck in 10 minutes.";
    return { gateId: g.id, gateName: g.name, density, label, action, actionKey: ACTION_KEY_BY_LABEL[label] };
  }).sort((a, b) => b.density - a.density);
}
