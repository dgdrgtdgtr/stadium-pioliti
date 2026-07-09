# StadiumPilot

**PromptWars — Challenge 4: Smart Stadiums & Tournament Operations**

A GenAI-style decision-support assistant for fans, volunteers, and venue staff during the FIFA World Cup 2026.

## Chosen Vertical

Challenge 4 asks for a solution that improves **navigation, crowd management, accessibility, transportation, sustainability, multilingual assistance, operational intelligence, and real-time decision support** at a stadium. StadiumPilot addresses all eight in a single lightweight app with two views:

- **Fan Assistant** — given a fan's seating stand, accessibility needs, and time relative to kickoff, recommends the best gate to use, an accessible alternate if the primary gate is overcrowded, an estimated walk time, a transportation tip, and a sustainability tip — with a plain-language explanation of *why*.
- **Volunteer / Staff / Organizer View** — a venue-wide organizer summary (average density, count of gates at critical level) sits above a live ranked list of every gate's crowd density with a concrete recommended operational action, so organizers get the 10,000-foot view and staff get the per-gate detail from the same underlying model.

## Approach & Logic

The core of the app is a **rule-based decision engine** (`js/engine.js`), deliberately built as a deterministic, dependency-free module rather than a live LLM call:

- **Why not call an LLM API directly?** The app is a static site (GitHub Pages, no backend). Any API key embedded in client-side JS would be exposed to every visitor — a real security risk. Instead, the "intelligence" is expressed as an explicit, auditable decision model: crowd density is derived from time-to-kickoff, routing considers seating stand + accessibility needs + real-time density, and gate assignment always keeps a guaranteed accessible fallback (`G5`) available. This keeps the assistant genuinely "smart" and context-driven while remaining 100% client-side, secure, and free to run.
- **Crowd simulation**: `crowdDensity()` models realistic patterns — a ramp-up in the hour before kickoff, a sharp post-match surge that decays over ~20 minutes, and quieter periods otherwise — parameterized by minutes-to-kickoff so it's fully deterministic and testable.
- **Routing logic**: `recommendRoute()` filters candidate gates by stand and accessibility requirement, picks the least-congested option, and only proposes an alternate route when the primary gate is at critical density (≥75/100).
- **Operational alerts**: `operationalAlerts()` reuses the same density model to rank all gates for staff, turning the fan-facing logic into an ops dashboard with zero duplicated logic.
- **Live-updating staff dashboard**: while the staff view is open, `effectiveMinutesToKickoff()` recomputes the countdown from real elapsed time and the dashboard auto-refreshes every 20s (interval is started on entering the view and cleared on leaving, so it never leaks). The "Updated HH:MM:SS" timestamp is genuinely live, not a static label — this is what makes the "real-time decision support" requirement actually real rather than just a claim.
- **Transportation guidance**: `transportAdviceKey()` recommends transit, shuttle, or walking based on time-to-kickoff — including a post-match departure tip to ease road congestion.
- **Sustainability tips**: `sustainabilityTipKey()` attaches a gate-specific tip (transit line, recycling point, bike rack, carpool zone) to every route recommendation.
- **Fully translated dynamic output**: unlike a chrome-only translation layer, the assistant's actual recommendation text (reason, transport tip, sustainability tip, staff action) is returned as an i18n key and translated per language — not just the static UI labels — across all 6 supported languages.

## How the Solution Works

1. Open `index.html` (or the deployed GitHub Pages link).
2. **Fan Assistant tab**: pick your stand, toggle wheelchair-accessible routing if needed, set minutes to kickoff, and tap "Get my route." The assistant explains its recommendation and offers an alternate if crowding is high.
3. **Volunteer/Staff tab**: see all gates ranked by live density with a recommended action per gate. A "Refresh now" button forces an immediate update without waiting for the 20s auto-refresh cycle.
4. Switch language via the dropdown (English, Spanish, French, Arabic, Portuguese, Hindi) — the UI, including `dir="rtl"` for Arabic, updates instantly.
5. Toggle high-contrast mode for low-vision accessibility.
6. The app registers a Service Worker so the core experience keeps working with intermittent stadium Wi-Fi.

## Assumptions Made

- No live venue data feed was available for this challenge, so crowd density is **simulated deterministically** from time-to-kickoff rather than pulled from real sensors/APIs. The engine is structured so a real data feed (turnstile counts, CCTV-based crowd estimation, etc.) could be substituted behind the same `crowdDensity()` interface without changing any UI or routing code.
- Gate/stand layout is a simplified generic model (5 gates, 8 stands) representative of a typical large stadium, since no specific venue schematic was provided.
- "GenAI-enabled" is interpreted as **AI-style contextual decision-making and natural-language explanation of recommendations**, implemented as an explicit, testable rules engine rather than a live third-party LLM call — a deliberate security and cost trade-off appropriate for a static, publicly-hosted submission.

## Tech Stack

Vanilla HTML/CSS/JS (ES modules), zero runtime dependencies, zero build step. Node's built-in test runner (`node --test`) is used for unit tests — no external testing framework needed.

## Running Tests

```bash
npm test
```

42 unit tests cover the decision engine (gate data integrity, crowd density bounds/determinism, routing logic including accessibility and fallback behavior, operational alert generation, transportation/sustainability key selection, organizer summary aggregation, the live-clock countdown function) and the i18n layer (translation completeness across all 6 supported languages including every dynamic-content key, a check that non-English languages aren't silently falling back to English text, and fallback behavior).

## Security Notes

- Strict Content-Security-Policy meta tag (`default-src 'self'`, no inline scripts/styles, no framing).
- No inline event handlers anywhere in the markup — all interactivity is wired via `addEventListener` in `js/app.js`.
- All dynamic content is inserted via `textContent`/DOM APIs, never `innerHTML` with unsanitized input, avoiding DOM-based XSS.
- No external network calls, no third-party scripts, no API keys — nothing to leak.

## Accessibility Notes

- Semantic HTML landmarks (`header`, `nav`, `main`, `footer`) and a "skip to main content" link.
- ARIA roles for the tab interface (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`).
- `aria-live="polite"` regions so route recommendations and staff alerts are announced by screen readers as they update.
- High-contrast mode toggle for low-vision users.
- `dir="rtl"` automatically applied for Arabic.
- Arrow-key navigation between the two tabs with roving `tabindex`, per the WAI-ARIA tabs pattern.
- The fan form is a real `<form>` with `<fieldset>`/`<legend>` grouping and a submit button, so pressing Enter anywhere in the form (not just clicking) gets a keyboard-only user their route.
