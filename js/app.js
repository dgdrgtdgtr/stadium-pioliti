import {
  GATES,
  recommendRoute,
  operationalAlerts,
  organizerSummary,
  effectiveMinutesToKickoff,
} from "./engine.js";
import { LANGS, t } from "./i18n.js";

const state = {
  lang: "en",
  view: "fan", // "fan" | "staff"
  highContrast: false,
  refreshIntervalId: null,
  staffClockStartedAt: null, // Date.now() timestamp; baseline for the live countdown
};

const STAFF_REFRESH_MS = 20000;

function $(sel, root = document) {
  return root.querySelector(sel);
}
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("aria-") || k === "role" || k === "tabindex") node.setAttribute(k, v);
    else node[k] = v;
  });
  children.forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return node;
}

/** Single source of truth for reading + defaulting the kickoff-minutes input. */
function getKickoffInputValue() {
  const raw = Number($("#kickoffInput").value);
  return Number.isNaN(raw) ? 0 : raw;
}

function applyStaticText() {
  document.title = t(state.lang, "title");
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";

  $("#appTitle").textContent = t(state.lang, "title");
  $("#tagline").textContent = t(state.lang, "tagline");
  $("#fanTabBtn").textContent = t(state.lang, "fanTab");
  $("#staffTabBtn").textContent = t(state.lang, "staffTab");
  $("#standLabelText").textContent = t(state.lang, "standLabel");
  $("#wheelchairLabelText").textContent = t(state.lang, "wheelchairLabel");
  $("#kickoffLabelText").textContent = t(state.lang, "kickoffLabel");
  $("#getRouteBtn").textContent = t(state.lang, "getRoute");
  $("#langLabelText").textContent = t(state.lang, "langLabel");
  $("#contrastLabelText").textContent = t(state.lang, "accessibilityToggle");
  $("#staffHeading").textContent = t(state.lang, "staffHeading");
  $("#fanFormLegend").textContent = t(state.lang, "fanFormLegend");
  $("#kickoffHint").textContent = t(state.lang, "kickoffHint");
}

function renderStandOptions() {
  const select = $("#standSelect");
  select.innerHTML = "";
  const uniqueStands = [...new Set(GATES.flatMap((g) => g.stands))].sort();
  uniqueStands.forEach((s) => {
    const opt = el("option", { value: s }, [`Stand ${s}`]);
    select.appendChild(opt);
  });
}

/** Builds a single gate card (primary or alternate); keeps both renders in one place. */
function buildGateCard(titleKey, gateInfo, extraRows = []) {
  return el("div", { class: `gate-card density-${gateInfo.label}` }, [
    el("h3", {}, [t(state.lang, titleKey)]),
    el("p", { class: "gate-name" }, [gateInfo.gate.name]),
    el("p", {}, [`${t(state.lang, "density")}: ${gateInfo.density}/100 (${gateInfo.label})`]),
    ...extraRows,
  ]);
}

function renderRouteResult(result) {
  const out = $("#routeResult");
  out.innerHTML = "";

  const walkRow = el("p", {}, [`${t(state.lang, "walkTime")}: ${result.estWalkMinutes} ${t(state.lang, "minutes")}`]);
  out.appendChild(buildGateCard("primaryGate", result.primary, [walkRow]));

  if (result.alternate) {
    out.appendChild(buildGateCard("alternateGate", result.alternate));
  }

  out.appendChild(el("p", { class: "reason" }, [`${t(state.lang, "reasonLabel")}: ${t(state.lang, result.reasonKey)}`]));
  out.appendChild(el("p", { class: "transport-tip" }, [`${t(state.lang, "transportLabel")}: ${t(state.lang, result.transportKey)}`]));
  out.appendChild(el("p", { class: "sustainability-tip" }, [`${t(state.lang, "sustainabilityLabel")}: ${t(state.lang, result.sustainabilityKey)}`]));
}

function renderStaffAlerts() {
  const baseKickoff = getKickoffInputValue();
  const elapsedMs = state.staffClockStartedAt === null ? 0 : Date.now() - state.staffClockStartedAt;
  const kickoff = effectiveMinutesToKickoff(baseKickoff, elapsedMs);

  const summary = organizerSummary(kickoff);
  const summaryEl = $("#organizerSummary");
  summaryEl.textContent = t(state.lang, "organizerSummaryTemplate")
    .replace("{avg}", summary.averageDensity)
    .replace("{critical}", summary.criticalGateCount)
    .replace("{total}", summary.totalGates);
  summaryEl.className = `organizer-summary density-${summary.overallLabel}`;

  const alerts = operationalAlerts(kickoff);
  const list = $("#staffAlertList");
  list.innerHTML = "";
  alerts.forEach((a) => {
    const item = el("li", { class: `alert-item density-${a.label}` }, [
      el("strong", {}, [a.gateName]),
      el("span", { class: "alert-density" }, [` — ${a.density}/100 (${a.label})`]),
      el("p", {}, [t(state.lang, a.actionKey)]),
    ]);
    list.appendChild(item);
  });

  const timeStr = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("#staffLastUpdated").textContent = `${t(state.lang, "lastUpdatedPrefix")} ${timeStr}`;
}

function switchView(view) {
  state.view = view;
  $("#fanPanel").hidden = view !== "fan";
  $("#staffPanel").hidden = view !== "staff";
  [$("#fanTabBtn"), $("#staffTabBtn")].forEach((btn) => {
    const selected = btn.id === (view === "fan" ? "fanTabBtn" : "staffTabBtn");
    btn.setAttribute("aria-selected", String(selected));
    btn.tabIndex = selected ? 0 : -1;
  });

  if (state.refreshIntervalId !== null) {
    clearInterval(state.refreshIntervalId);
    state.refreshIntervalId = null;
  }

  if (view === "staff") {
    state.staffClockStartedAt = Date.now();
    renderStaffAlerts();
    state.refreshIntervalId = setInterval(renderStaffAlerts, STAFF_REFRESH_MS);
  }
}

/** Arrow-key navigation between tabs, per the WAI-ARIA tabs pattern. */
function handleTabKeydown(e) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const next = e.key === "ArrowRight" ? "staff" : "fan";
  switchView(next);
  $(next === "fan" ? "#fanTabBtn" : "#staffTabBtn").focus();
}

function handleGetRoute(e) {
  if (e) e.preventDefault();
  const stand = $("#standSelect").value;
  const wheelchairAccess = $("#wheelchairCheck").checked;
  const minutesToKickoff = getKickoffInputValue();
  const result = recommendRoute({ stand, wheelchairAccess, minutesToKickoff });
  renderRouteResult(result);
}

function toggleContrast() {
  state.highContrast = !state.highContrast;
  document.body.classList.toggle("high-contrast", state.highContrast);
}

function init() {
  renderStandOptions();
  applyStaticText();
  switchView("fan");

  $("#fanTabBtn").addEventListener("click", () => switchView("fan"));
  $("#staffTabBtn").addEventListener("click", () => switchView("staff"));
  $(".tabs").addEventListener("keydown", handleTabKeydown);
  $("#fanForm").addEventListener("submit", handleGetRoute);
  $("#contrastToggle").addEventListener("click", toggleContrast);
  $("#kickoffInput").addEventListener("input", () => {
    if (state.view === "staff") {
      state.staffClockStartedAt = Date.now();
      renderStaffAlerts();
    }
  });

  const langSelect = $("#langSelect");
  LANGS.forEach((l) => langSelect.appendChild(el("option", { value: l }, [l.toUpperCase()])));
  langSelect.addEventListener("change", (e) => {
    state.lang = e.target.value;
    applyStaticText();
    if (state.view === "staff") renderStaffAlerts();
    else if ($("#routeResult").children.length > 0) handleGetRoute();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is a progressive enhancement; failures are non-fatal */
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
