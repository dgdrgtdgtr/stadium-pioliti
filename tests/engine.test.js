import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  GATES,
  crowdDensity,
  densityLabel,
  recommendRoute,
  operationalAlerts,
} from "../js/engine.js";

describe("GATES data integrity", () => {
  test("has at least 5 gates", () => {
    assert.ok(GATES.length >= 5);
  });
  test("every gate has required fields", () => {
    GATES.forEach((g) => {
      assert.ok(g.id);
      assert.ok(g.name);
      assert.ok(Array.isArray(g.stands));
      assert.equal(typeof g.wheelchair, "boolean");
      assert.equal(typeof g.baseWalk, "number");
    });
  });
  test("overflow gate G5 covers every stand", () => {
    const g5 = GATES.find((g) => g.id === "G5");
    const allStands = [...new Set(GATES.flatMap((g) => g.stands))].filter((s) => s);
    allStands.forEach((s) => assert.ok(g5.stands.includes(s)));
  });
  test("gate ids are unique", () => {
    const ids = GATES.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("crowdDensity", () => {
  test("returns a value between 0 and 100", () => {
    for (let m = -30; m <= 120; m += 5) {
      const d = crowdDensity("G1", m);
      assert.ok(d >= 0 && d <= 100, `density ${d} out of range at minute ${m}`);
    }
  });
  test("is deterministic for same inputs", () => {
    assert.equal(crowdDensity("G2", 20), crowdDensity("G2", 20));
  });
  test("pre-match density near kickoff is generally high", () => {
    const d = crowdDensity("G1", 5);
    assert.ok(d >= 50);
  });
  test("far from kickoff density is lower", () => {
    const near = crowdDensity("G1", 5);
    const far = crowdDensity("G1", 180);
    assert.ok(far < near);
  });
});

describe("densityLabel", () => {
  test("classifies boundaries correctly", () => {
    assert.equal(densityLabel(0), "low");
    assert.equal(densityLabel(24), "low");
    assert.equal(densityLabel(25), "moderate");
    assert.equal(densityLabel(49), "moderate");
    assert.equal(densityLabel(50), "high");
    assert.equal(densityLabel(74), "high");
    assert.equal(densityLabel(75), "critical");
    assert.equal(densityLabel(100), "critical");
  });
});

describe("recommendRoute", () => {
  test("returns a gate valid for the given stand", () => {
    const result = recommendRoute({ stand: "C", wheelchairAccess: false, minutesToKickoff: 30 });
    assert.ok(result.primary.gate.stands.includes("C"));
  });
  test("respects wheelchair accessibility requirement", () => {
    const result = recommendRoute({ stand: "E", wheelchairAccess: true, minutesToKickoff: 30 });
    assert.equal(result.primary.gate.wheelchair, true);
    if (result.alternate) assert.equal(result.alternate.gate.wheelchair, true);
  });
  test("falls back to overflow gate for unknown stand", () => {
    const result = recommendRoute({ stand: "Z", wheelchairAccess: false, minutesToKickoff: 30 });
    assert.equal(result.primary.gate.id, "G5");
  });
  test("only ever suggests an alternate when primary is critical", () => {
    // Sweep a range of stands/times: whenever an alternate is present, primary must be critical.
    for (const stand of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      for (let m = -20; m <= 90; m += 10) {
        const result = recommendRoute({ stand, wheelchairAccess: false, minutesToKickoff: m });
        if (result.alternate !== null) {
          assert.equal(result.primary.label, "critical");
          assert.notEqual(result.alternate.gate.id, result.primary.gate.id);
        }
      }
    }
  });
  test("estimated walk time is a positive number", () => {
    const result = recommendRoute({ stand: "G", wheelchairAccess: false, minutesToKickoff: 15 });
    assert.ok(result.estWalkMinutes > 0);
  });
  test("reason string is non-empty", () => {
    const result = recommendRoute({ stand: "B", wheelchairAccess: false, minutesToKickoff: 45 });
    assert.ok(result.reason.length > 0);
  });
});

describe("operationalAlerts", () => {
  test("returns one alert per gate", () => {
    const alerts = operationalAlerts(30);
    assert.equal(alerts.length, GATES.length);
  });
  test("alerts are sorted by density descending", () => {
    const alerts = operationalAlerts(10);
    for (let i = 1; i < alerts.length; i++) {
      assert.ok(alerts[i - 1].density >= alerts[i].density);
    }
  });
  test("critical alerts recommend overflow gate action", () => {
    const alerts = operationalAlerts(5);
    alerts
      .filter((a) => a.label === "critical")
      .forEach((a) => assert.match(a.action, /overflow/i));
  });
  test("every alert has a gate name and action string", () => {
    const alerts = operationalAlerts(60);
    alerts.forEach((a) => {
      assert.ok(a.gateName);
      assert.ok(a.action.length > 0);
    });
  });
});
