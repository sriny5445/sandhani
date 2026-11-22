# Tool prompts — Sandhani

Use these prompts to build the app specified in `PROJECT_REQUIREMENTS.md`. Paste one block at a time. Do not paste a later phase before the earlier phase is green.

The spec is the source of truth. If a prompt and the spec disagree, follow the spec.

Shared rules for every tool:

- Python 3.12. FastAPI serves both `/api/*` and `public/`.
- Implement A* yourself. Do not add NetworkX or any routing engine.
- Do not add accounts, a database, a map-tile provider, or a frontend build step.
- Keep going until the phase’s checks pass. Do not stop after a scaffold.
- Do not rename ids in `data/sandhani_city.json` once a later phase has tests that use them.

---

## 0. Kickoff prompt (any tool)

Paste this once, before Phase 1, if the tool has not read the repo.

```text
You are implementing Sandhani in this repository. Read PROJECT_REQUIREMENTS.md end to end before you create or edit any code. Also read TOOL_PROMPTS.md so you know the phase boundaries.

Build a deployable route-optimization web app: a Python graph and A* search, a FastAPI JSON API, and a static map UI in public/. Deploy target is Vercel. The original assignment (shortest and fastest path on a weighted city graph) is the engine; the UI in sections 7 and 13 of the spec is required.

Work only on the phase I name. When I have not named a phase, start at Phase 1 and continue through Phase 7 in order. After each phase, run the checks listed for that phase and fix failures before moving on.

Do not install a routing library. Do not invent features from section 4 (non-goals). Match the repository layout in section 12.1.
```

---

## Grok Build

Grok Build can run the app and check the UI. Use the kickoff prompt, then the phase prompts. In Phases 5–7, require a browser pass, not only pytest.

### Grok Phase 1 — Graph and city

```text
Phase 1 of Sandhani. Read PROJECT_REQUIREMENTS.md sections 6, 9, 10, and 12.1.

Create the package layout, but implement only the graph layer and the city file:
- src/sandhani/graph/model.py, geo.py, validate.py, load.py
- data/sandhani_city.json
- scripts/check_city.py
- tests/test_validate.py
- pytest.ini with pythonpath = src
- requirements.txt with fastapi, pydantic, uvicorn, pytest, httpx
- empty packages (__init__.py) for search, routing, and api so later phases have a home

City content must meet section 10: 50–80 nodes, 18+ named places, a highway, a bridge shortcut with ids e-bridge-n and e-bridge-s, a parallel surface crossing, a one-way pair, evening-peak vs night disagreement, and a bridge closure that forces a detour over 600 m. Use a real lat/lon box about 4 km across. Every edge.length_m must be >= haversine(from, to).

Haversine lives in geo.py and returns meters. Validator checks are exactly the list in section 10. load.py reads the JSON and validates. check_city.py prints node count, edge count, place count, and “ok”.

Tests: dangling endpoint rejected, edge shorter than haversine rejected, full city loads, city stays connected with no closures.

Checks you must run:
  python -m pytest tests/test_validate.py -q
  python scripts/check_city.py
Fix anything that fails. Do not start A* in this phase.
```

### Grok Phase 2 — A*

```text
Phase 2 of Sandhani. Read PROJECT_REQUIREMENTS.md sections 6 and 9.

Implement src/sandhani/search/astar.py and heuristic.py. Dijkstra is A* with heuristic 0, not a second algorithm. Tie-break is smaller h, then node id, then insertion counter. Skip edges whose weight is infinite. Return path nodes, edges, cost, and nodes_expanded, or a no-path result. Docstrings must say why the distance heuristic and the time heuristic are admissible.

Write tests/test_astar.py and tests/test_heuristic.py:
- A 6-node hand fixture where shortest and fastest optima differ. Assert both paths and both costs.
- A* cost equals Dijkstra cost on the fixture and on every band of Sandhani City, with the bridge open and with e-bridge-n and e-bridge-s closed.
- One-way edges are never traversed backward.
- Closing the bridge removes it from the path and increases distance.
- Two identical searches return the same node list.
- On 30 random city pairs, h(n) does not exceed the true cost from n to the goal for both objectives at night.

Run: python -m pytest tests/test_astar.py tests/test_heuristic.py tests/test_validate.py -q
Fix failures before stopping. Do not build the HTTP layer yet.
```

### Grok Phase 3 — Routing service

```text
Phase 3 of Sandhani. Read PROJECT_REQUIREMENTS.md sections 6, 10, and 11 (response shape only).

Implement:
- src/sandhani/routing/service.py with route() and compare()
- src/sandhani/routing/steps.py
- src/sandhani/routing/reasons.py
- tests/test_routing.py

route() applies the band multiplier and user slowdowns, treats closures as infinite weight, and returns the fields the API will need: nodes, edges, steps, summary, reason, alternate_objective. Start==goal is a 200-style empty trip, not an error. No path is a typed no_path result, not an exception for the caller to stringify.

Steps group consecutive edges with the same road name. Maneuver is left, right, or straight from the turn angle in geo.py. First step departs, last step arrives.

reasons.py uses templates and the edges on the path (bridge used, bridge closed, highway share). No LLM calls.

compare() runs A* and Dijkstra and sets costs_match when costs are within 1e-6.

Tests must cover: peak_pm can change the fastest path versus night on the city; shortest geometry ignores the band; a slowdown factor of 0.4 increases time; steps collapse a two-edge street into one instruction; alternate_objective is present.

Run the full pytest suite and fix failures. Do not add FastAPI routes yet.
```

### Grok Phase 4 — API and local server

```text
Phase 4 of Sandhani. Read PROJECT_REQUIREMENTS.md sections 11, 12.2, 12.3, and 12.4.

Add src/sandhani/api/schemas.py (Pydantic v2) and api/index.py. The module-level FastAPI object must be named app. Routes match section 11 exactly, including error codes. Static files: mount public/ so GET / returns public/index.html. Put a minimal public/index.html that only says Sandhani is up and links nothing yet — Phase 5 replaces it.

Error bodies are { "error": { "code", "message" } }. No stack traces.

tests/test_api.py uses TestClient against the full city: health, city document, a route you have checked by hand, unknown node 404, validation 422, no_path when closures isolate a node (add a test-only closure of every edge out of one place, or pick a cut that exists).

Local prefix: paths are /api/health and so on under uvicorn.

Run: python -m pytest -q
Then start uvicorn on port 8000, curl GET /api/health and POST /api/route for the hand-checked pair, and stop the server. Record the hand-checked origin, destination, band, node ids, distance, and time — you will put them in the README in Phase 7.

Do not build the map yet.
```

### Grok Phase 5 — Map and the primary trip

```text
Phase 5 of Sandhani. Read PROJECT_REQUIREMENTS.md sections 7.1, 7.2, 7.3, and 13, and follow design.md for layout, copy, and visual detail.

Replace public/index.html, styles.css, and app.js. Add public/favicon.svg. No bundler, no map-tile SDK, no CSS framework. One app.js file is fine.

The page loads GET /api/cities/sandhani-city, draws the SVG map from node lat/lon (equirectangular, fit to bounds), and lets me set origin and destination by search and by clicking near a node (180 m snap). Default objective is fastest. Choosing a departure sets the band. Submit calls POST /api/route and draws the returned edges only — do not search on the client.

Show the summary, stats, alternate-objective line, steps, and reason from the JSON. Include swap and clear. Empty, same-place, no-path, and failed-fetch states use the copy in section 7.2.

Visual rules are section 13. Include zoom buttons, drag pan, and a 12 px hit stroke so roads can be selected later.

After pytest is still green, start the server and verify in the browser at desktop width:
- Search two place names, run Fastest, see a polyline and steps that name the same roads as the line.
- Switch to Shortest and confirm the summary numbers change or stay, consistent with the new response.
- Same-place search shows a zero trip.
Do not claim this phase is done from a screenshot alone. Click through the flow.
```

### Grok Phase 6 — Conditions, share links, comparison

```text
Phase 6 of Sandhani. Read PROJECT_REQUIREMENTS.md sections 7.4, 7.5, 7.6, and F-10 through F-13. Presentation for conditions, steps, and the search disclosure is in design.md.

Extend the existing UI. Do not rewrite the search.

- Clicking a road selects it and can Close or Slow to 40%. Closed roads look different on the map. Clear conditions removes closures and slowdowns.
- Preset buttons from the city scenarios plus “Clear afternoon” and “Evening peak” (section 7.4).
- Share link encodes city, origin, destination, objective, band, closures, and slowdowns in the query string. On load, apply the query and POST /api/route.
- Keep up to 8 recent trips in localStorage and replay them.
- The “How this route was searched” disclosure calls POST /api/route/compare and shows both expansion counts and costs_match.

Then check in the browser:
- Apply “Harbor Bridge closed” (or the scenario with that effect) and confirm the highlighted path does not include e-bridge-n or e-bridge-s.
- Copy the share link, open it, and confirm the same endpoints and the same step list.
- Run the Dijkstra comparison and confirm costs_match is true in the panel.
- At 375 px width, complete a trip using only the search fields. The map stays visible and the steps scroll.
- Tab through search, objective, and the main button. Focus is visible.
Run pytest again.
```

### Grok Phase 7 — README and Vercel

```text
Phase 7 of Sandhani. Read PROJECT_REQUIREMENTS.md sections 12.4, 14.2, and 14.3.

Write README.md with: what the app does, Python setup, uvicorn command, pytest command, the hand-checked route from Phase 4 (ids, distance, time, band, objective), and Vercel deploy steps from the repo root. Explain in four lines how /api/health stays /api/health both locally and on Vercel (section 12.4). Add vercel.json to match that explanation.

Smoke-test the prefix. If the Vercel CLI is available and I am authenticated, run a deployment or `vercel dev` and curl /api/health. If you cannot deploy, say so and still prove local /api/health.

Re-run the full pytest suite. Re-check acceptance scenarios 1, 3, and 5 from section 14.2 in the browser. Fix regressions you find. Do not add features that are not in the spec.
```

### Grok repair prompt

Use this when a phase is wrong rather than empty.

```text
Sandhani does not match PROJECT_REQUIREMENTS.md. Compare the app with the phase we are in and with sections 7, 11, and 14.

List the mismatches you can reproduce, then fix only those. Re-run pytest and, if the UI is involved, repeat the browser checks for this phase. Do not refactor modules that already match the spec. Do not add libraries.
```

---

## Codex

Codex works best with a short contract, the files it may touch, and a command it must run. Paste the kickoff prompt first. If the session supports `AGENTS.md`, also save the “Codex standing orders” block as `AGENTS.md` before Phase 1 (that file is allowed even though section 12.1 omitted it; add it to the layout note in the README).

### Codex standing orders

Save as `AGENTS.md`.

```text
# Sandhani standing orders

Read PROJECT_REQUIREMENTS.md before coding. Implement only the phase in the user message.

- Python 3.12. App entry: api/index.py exports FastAPI `app`. UI: public/. Domain code: src/sandhani/.
- A* is handwritten in src/sandhani/search/astar.py. requirements.txt may contain only fastapi, pydantic, uvicorn, pytest, and httpx.
- No accounts, database, map tiles, bundler, or live traffic.
- Tests use pytest with pythonpath = src. Do not skip tests to make them pass.
- Public routes stay /api/* on uvicorn. Follow section 12.4 for Vercel.
- After the task, run the test command in the phase prompt and fix failures.
- Do not edit PROJECT_REQUIREMENTS.md or TOOL_PROMPTS.md.
```

### Codex Phase 1

```text
Implement Phase 1 only.

Allowed files: pytest.ini, requirements.txt, scripts/check_city.py, data/sandhani_city.json, src/sandhani/**/__init__.py, src/sandhani/graph/*.py, tests/test_validate.py.

Follow PROJECT_REQUIREMENTS.md sections 10 and 12.1. City id is sandhani-city. Bridge edge ids are e-bridge-n and e-bridge-s. 50–80 nodes, at least 18 places, length_m >= haversine, validator rules as written, check_city.py prints counts and ok.

Done when both commands exit 0:
  python -m pytest tests/test_validate.py -q
  python scripts/check_city.py
Reply with node count, edge count, and place count.
```

### Codex Phase 2

```text
Implement Phase 2 only. Graph code from Phase 1 must stay.

Allowed files: src/sandhani/search/astar.py, src/sandhani/search/heuristic.py, tests/test_astar.py, tests/test_heuristic.py.

Follow sections 6 and 9. One A* implementation; Dijkstra is heuristic 0. Tie-break (f, h, node id). Admissible heuristics documented in the module docstring.

Include the 6-node fixture (different shortest vs fastest paths), city-wide A* vs Dijkstra equality for both objectives and all bands, bridge open and closed, one-way test, stability test, and 30 random pairs where h does not exceed true cost.

Done when this exits 0:
  python -m pytest tests/test_astar.py tests/test_heuristic.py tests/test_validate.py -q
Reply with the fixture’s shortest node list and fastest node list.
```

### Codex Phase 3

```text
Implement Phase 3 only.

Allowed files: src/sandhani/graph/geo.py (turn angle only, if missing), src/sandhani/routing/service.py, steps.py, reasons.py, tests/test_routing.py.

Follow the route response content in section 11 and the weight formula in section 10. No FastAPI imports in routing/. Templates only in reasons.py.

Cover in tests: band can change the fastest path; band does not change shortest geometry; factor 0.4 changes time; collapsed steps; alternate_objective; start==goal; no_path.

Done when `python -m pytest -q` exits 0.
```

### Codex Phase 4

```text
Implement Phase 4 only.

Allowed files: src/sandhani/api/schemas.py, api/index.py, public/index.html (placeholder), tests/test_api.py.

Contract is section 11. Error shape { "error": { "code", "message" } }. GET / serves public/index.html. TestClient tests listed in section 14.1.

Done when `python -m pytest -q` exits 0 and this returns status ok:
  uvicorn api.index:app --port 8000
  curl -sS localhost:8000/api/health
Stop uvicorn after the curl. In the reply, include one hand-checked POST /api/route body and the distance_m, time_s, and node id list.
```

### Codex Phase 5

```text
Implement Phase 5 only. Follow design.md for layout, copy, and visual detail. API behavior stays as it is unless a test proves it is wrong.

Allowed files: public/index.html, public/styles.css, public/app.js, public/favicon.svg.

Build the map-first UI in sections 7.1–7.3 and 13. Vanilla JS. Fetch the city and POST /api/route. Draw only the server’s edges. Search and map snap both set endpoints. Show summary, stats, alternate objective, steps, reason, swap, and clear. Include the four empty/error states.

Do not add a package.json. Do not call a directions API.

Done when `python -m pytest -q` exits 0. In the reply, list the DOM ids for origin input, destination input, objective control, plan button, and the route SVG path.
```

### Codex Phase 6

```text
Implement Phase 6 only.

Allowed files: public/index.html, public/styles.css, public/app.js, and tests if you add an API case you can cover without a browser.

Add road select, close, slow to 40%, clear conditions, presets, share-link encode/decode, 8 recents in localStorage, and the Dijkstra disclosure calling POST /api/route/compare. Follow sections 7.4–7.6 and the matching sections in design.md. Closed edges must be visually distinct. Keyboard focus must be visible. Layout must work at 375px and 1280px (stacked vs side panel).

Done when `python -m pytest -q` exits 0. In the reply, give the query-string keys you used.
```

### Codex Phase 7

```text
Implement Phase 7 only.

Allowed files: README.md, vercel.json, api/index.py (only if the /api prefix must be corrected), tests if the prefix change needs a regression test.

README includes setup, uvicorn, pytest, the hand-checked route, and Vercel. vercel.json and the app must serve GET /api/health both locally and on Vercel, per section 12.4. State which prefix mechanism you used.

Done when `python -m pytest -q` exits 0 and `curl -sS localhost:8000/api/health` returns status ok while uvicorn is running. Stop the server afterward.
```

### Codex review prompt

```text
Review the working tree against PROJECT_REQUIREMENTS.md sections 8, 9, 11, 12, and 14. Do not change code in this pass.

Report:
- requirements that are met
- requirements that are missing or wrong, with file and line
- any routing library or network call inside the search path
- whether tests assert optimality or only that a path exists

Then stop.
```

---

## Antigravity

Antigravity should plan in an artifact, then implement, then verify in its browser. Paste the kickoff prompt, then one phase. Ask it to keep a single `implementation_plan` artifact updated, and to finish each phase with a walkthrough artifact.

### Antigravity standing prompt

Paste this at the start of every Antigravity task, then the phase block.

```text
Project: Sandhani, in the open workspace. Spec: PROJECT_REQUIREMENTS.md. Prompt pack: TOOL_PROMPTS.md.

Before editing, update the implementation plan artifact: goal of this phase, files you will touch, and the checks you will run. Then implement only that plan. When the checks pass, write a walkthrough artifact with the commands, their results, and screenshots of any UI step.

Constraints:
- Handwritten A* only. No NetworkX, OSRM, or directions API.
- Python owns search. The browser posts JSON and draws the result.
- Dependencies limited to fastapi, pydantic, uvicorn, pytest, httpx.
- Do not expand into accounts, databases, or live traffic.
- If the spec and your plan disagree, change the plan.
```

### Antigravity Phase 1

```text
Phase 1 — city graph.

Create the Python package, the validator, haversine, the Sandhani City JSON, and scripts/check_city.py as specified in sections 10 and 12.1. Bridge edges e-bridge-n and e-bridge-s. Meet the size and scenario rules in section 10.

Verify with pytest tests/test_validate.py and python scripts/check_city.py. The walkthrough should include the printed counts.
```

### Antigravity Phase 2

```text
Phase 2 — A*.

Add search/astar.py and search/heuristic.py per sections 6 and 9. Dijkstra is the zero heuristic. Prove optimality with the tests in section 14.1 (fixture, city-wide cost match, admissibility sample, one-way, closure, stability).

Verify with pytest on tests/test_astar.py, tests/test_heuristic.py, and tests/test_validate.py. In the walkthrough, show the fixture’s two different optimal paths.
```

### Antigravity Phase 3

```text
Phase 3 — routing service.

Add routing/service.py, steps.py, and reasons.py. Shape the result so Phase 4 can return it with little mapping. Weight formula and step rules are in sections 10 and 11. Reasons are templates.

Verify with pytest -q. Walkthrough: one night route and one peak_pm route between the same places, and whether the node lists differ.
```

### Antigravity Phase 4

```text
Phase 4 — FastAPI.

Expose section 11 from api/index.py with schemas in src/sandhani/api/schemas.py. Serve a placeholder public/index.html at /. Errors use the spec’s JSON shape.

Verify with pytest -q and a browser or curl hit on http://127.0.0.1:8000/api/health while the app is running. Walkthrough includes the health JSON and one route JSON.
```

### Antigravity Phase 5

```text
Phase 5 — usable map UI.

Build public/index.html, styles.css, app.js, and favicon.svg to sections 7.1–7.3 and 13, and follow design.md. Custom SVG map from the city coordinates. No tile layer. No client-side A*.

Verify with the browser agent at a desktop width:
1. Type two place names and plan a fastest route.
2. Confirm the drawn roads are the edges in the response (spot-check two road names against the step list).
3. Switch to shortest.
4. Plan a trip where origin equals destination and confirm the zero-trip state.
Screenshot each step in the walkthrough. pytest -q must still pass.
```

### Antigravity Phase 6

```text
Phase 6 — conditions and links.

Add closures, 40% slowdowns, presets, share links, recents, and the search disclosure (sections 7.4–7.6 and design.md).

Verify in the browser:
1. Bridge-closed preset changes the polyline so the bridge edges are unused.
2. Open the copied URL in a new tab and show the same trip.
3. Dijkstra disclosure shows matching costs.
4. Repeat a search-only trip at 375 px wide.
Put those four screenshots in the walkthrough.
```

### Antigravity Phase 7

```text
Phase 7 — ship.

Add README.md and vercel.json. Make GET /api/health the same path locally and on Vercel (section 12.4). Document the hand-checked route.

Verify pytest -q, local health, and the three acceptance scenarios 1, 3, and 5. If you can deploy, smoke-test the deployed /api/health and one POST /api/route. If you cannot, say what blocked deployment. Walkthrough lists any spec item you intentionally left out (there should be none).
```

### Antigravity critique prompt

Run this after Phase 7, in a fresh task, before calling the project done.

```text
You are reviewing Sandhani, not extending it. Read PROJECT_REQUIREMENTS.md section 8 and section 14.

Exercise the running app in the browser: happy path, shortest vs fastest, bridge closure, share link, 375 px search-only trip. Also read astar.py and confirm the heap order and the heuristic.

Write a review artifact: pass/fail per F-1…F-13, bugs with reproduction steps, and spec drift. Change code only for a fail that you reproduced. Re-test those fails.
```

---

## One-shot prompt (only if the tool cannot hold a multi-phase session)

Prefer the phases. Use this only when the tool will take a single long task.

```text
Read PROJECT_REQUIREMENTS.md and implement the whole Sandhani app in the order in section 15. Repository layout is section 12.1. Stack is Python FastAPI plus static files in public/, deployable to Vercel, with handwritten A*.

Satisfy every functional requirement F-1…F-13 and the definition of done in section 14.3. Run pytest and fix failures. For the UI, run the acceptance scenarios in section 14.2 before you finish. Write README.md with the hand-checked route and the Vercel /api prefix note.

Do not add features from section 4. Do not add a routing library, a database, or a frontend build.
```

---

## Prompt map

| Phase | Result | Grok Build extra | Codex extra | Antigravity extra |
| --- | --- | --- | --- | --- |
| 1 | Valid city graph | Run check_city.py | File allow-list | Plan + counts in walkthrough |
| 2 | Optimal A* | Full heuristic tests | Reply with both fixture paths | Show both paths |
| 3 | Steps, reasons, weights | — | No FastAPI in routing/ | Night vs peak comparison |
| 4 | HTTP API | curl the hand-checked pair | Record that pair for the README | Health and route JSON |
| 5 | Map trip | Click through search and objective | Report DOM ids | Browser screenshots |
| 6 | Closures and links | 375 px and share link | Report query keys | Four screenshots |
| 7 | README + Vercel | Acceptance 1, 3, 5 | Prefix mechanism in the reply | Deploy smoke or a blocker note |
