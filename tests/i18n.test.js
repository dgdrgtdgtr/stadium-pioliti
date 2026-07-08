import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { LANGS, STRINGS, t } from "../js/i18n.js";

describe("i18n coverage", () => {
  const requiredKeys = [
    "title", "tagline", "fanTab", "staffTab", "standLabel", "wheelchairLabel",
    "kickoffLabel", "getRoute", "primaryGate", "alternateGate", "walkTime",
    "minutes", "density", "reasonLabel", "staffHeading", "noAlerts",
    "langLabel", "accessibilityToggle", "fanFormLegend", "kickoffHint", "lastUpdatedPrefix",
    "reasonCritical", "reasonOk", "actionCritical", "actionHigh",
    "actionModerate", "actionLow", "transportLabel", "transportTipEarly",
    "transportTipShuttle", "transportTipWalkNow", "transportTipDeparture",
    "sustainabilityLabel", "sustainabilityTipG1", "sustainabilityTipG2",
    "sustainabilityTipG3", "sustainabilityTipG4", "sustainabilityTipG5",
    "organizerSummaryTemplate",
  ];

  test("supports at least 5 languages", () => {
    assert.ok(LANGS.length >= 5);
  });

  test("every language has every required key non-empty", () => {
    LANGS.forEach((lang) => {
      requiredKeys.forEach((key) => {
        const val = STRINGS[lang] && STRINGS[lang][key];
        assert.ok(val && val.length > 0, `${lang}.${key} missing or empty`);
      });
    });
  });

  test("t() falls back to English for unknown language", () => {
    assert.equal(t("zz", "title"), STRINGS.en.title);
  });

  test("t() falls back to key string for unknown key", () => {
    assert.equal(t("en", "notARealKey"), "notARealKey");
  });

  test("t() returns correct string for a known lang/key pair", () => {
    assert.equal(t("fr", "getRoute"), STRINGS.fr.getRoute);
  });

  test("non-English languages don't silently fall back to English text for dynamic keys", () => {
    const dynamicKeys = [
      "reasonCritical", "reasonOk", "actionCritical", "actionHigh", "actionModerate",
      "actionLow", "transportTipEarly", "transportTipShuttle", "transportTipWalkNow",
      "transportTipDeparture", "sustainabilityTipG1", "sustainabilityTipG2",
      "sustainabilityTipG3", "sustainabilityTipG4", "sustainabilityTipG5",
    ];
    LANGS.filter((l) => l !== "en").forEach((lang) => {
      dynamicKeys.forEach((key) => {
        assert.notEqual(STRINGS[lang][key], STRINGS.en[key], `${lang}.${key} matches English verbatim`);
      });
    });
  });
});
