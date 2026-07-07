import { GATES, recommendRoute, operationalAlerts, densityLabel } from "./engine.js";
import { LANGS, t } from "./i18n.js";

const state = {
  lang: "en",
  view: "fan", // "fan" | "staff"
  highContrast: false,
};

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

function renderRouteResult(result) {
  const out = $("#routeResult");
  out.innerHTML = "";
  out.setAttribute("aria-live", "polite");

  const primaryCard = el("div", { class: `gate-card density-${result.primary.label}` }, [
    el("h3", {}, [t(state.lang, "primaryGate")]),
    el("p", { class: "gate-name" }, [result.primary.gate.name]),
    el("p", {}, [`${t(state.lang, "density")}: ${result.primary.density}/100 (${result.primary.label})`]),
    el("p", {}, [`${t(state.lang, "walkTime")}: ${result.estWalkMinutes} ${t(state.lang, "minutes")}`]),
  ]);
  out.appendChild(primaryCard);

  if (result.alternate) {
    const altCard = el("div", { class: `gate-card density-${result.alternate.label}` }, [
      el("h3", {}, [t(state.lang, "alternateGate")]),
      el("p", { class: "gate-name" }, [result.alternate.gate.name]),
      el("p", {}, [`${t(state.lang, "density")}: ${result.alternate.density}/100 (${result.alternate.label})`]),
    ]);
    out.appendChild(altCard);
  }

  const reason = el("p", { class: "reason" }, [`${t(state.lang, "reasonLabel")}: ${result.reason}`]);
  out.appendChild(reason);
}

function renderStaffAlerts() {
  const kickoff = Number($("#kickoffInput").value) || 0;
  const alerts = operationalAlerts(kickoff);
  const list = $("#staffAlertList");
  list.innerHTML = "";
  alerts.forEach((a) => {
    const item = el("li", { class: `alert-item density-${a.label}` }, [
      el("strong", {}, [a.gateName]),
      el("span", { class: "alert-density" }, [` — ${a.density}/100 (${a.label})`]),
      el("p", {}, [a.action]),
    ]);
    list.appendChild(item);
  });
}

function switchView(view) {
  state.view = view;
  $("#fanPanel").hidden = view !== "fan";
  $("#staffPanel").hidden = view !== "staff";
  $("#fanTabBtn").setAttribute("aria-selected", String(view === "fan"));
  $("#staffTabBtn").setAttribute("aria-selected", String(view === "staff"));
  if (view === "staff") renderStaffAlerts();
}

function handleGetRoute() {
  const stand = $("#standSelect").value;
  const wheelchairAccess = $("#wheelchairCheck").checked;
  const minutesToKickoff = Number($("#kickoffInput").value) || 0;
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
  $("#getRouteBtn").addEventListener("click", handleGetRoute);
  $("#contrastToggle").addEventListener("click", toggleContrast);
  $("#kickoffInput").addEventListener("input", () => {
    if (state.view === "staff") renderStaffAlerts();
  });

  const langSelect = $("#langSelect");
  LANGS.forEach((l) => langSelect.appendChild(el("option", { value: l }, [l.toUpperCase()])));
  langSelect.addEventListener("change", (e) => {
    state.lang = e.target.value;
    applyStaticText();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is a progressive enhancement; failures are non-fatal */
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
