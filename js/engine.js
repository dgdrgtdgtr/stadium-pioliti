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
  if (minutesToKickoff <= -1 && minutesToKickoff >= -20) {
    base = 90 - Math.abs(minutesToKickoff) * 1.5; // post-match surge, decaying
  } else if (minutesToKickoff >= 0 && minutesToKickoff <= 60) {
    base = 90 - minutesToKickoff; // pre-match ramp-up
  } else if (minutesToKickoff > 60) {
    base = Math.max(10, 30 - (minutesToKickoff - 60) / 5);
  } else {
    base = 20; // deep post-match, mostly cleared
  }
  const jitter = (seed * 7) % 15;
  return Math.max(0, Math.min(100, Math.round(base + jitter - 7)));
}

export function densityLabel(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
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
  const overflowNeeded = primary.density >= 75;

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

  const walkPenalty = Math.round((primary.density / 100) * 4); // congestion adds walk time
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
