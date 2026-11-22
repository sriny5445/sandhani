# Sandhani — Project Requirements

**Product:** Sandhani, a GPS route optimizer  
**Problem source:** `project_req.txt` (Route Optimization System / Smart Navigation)  
**Stack:** Python 3.12 (domain, A* search, HTTP API) + a static browser UI  
**Deploy target:** Vercel  
**Status:** Requirements for implementation. This repository does not yet contain the app.

## 1. Summary

Build a usable navigation app that models a city as a weighted graph and returns the best path between two places. The academic core is an implementation of A* (and Dijkstra as the zero-heuristic baseline). The product around that core must be something a person can open in a browser: pick a start and an end, choose what “best” means, see the route on a map, read turn-by-turn directions, and change traffic or close a road and watch the route change.

The original deliverable — “code outputting the most efficient path between two given city nodes” — is satisfied by the API and by the on-screen route. A script that only prints node ids is not enough.

## 2. Problem statement

Drivers and dispatchers need a path through a street network that respects direction, distance, speed, and traffic. Intersections are nodes. Road segments are directed edges with weights. The weight depends on the chosen objective (shortest distance or fastest time) and on conditions (time of day, a closure, a slowdown).

The system must:

- Represent the city as an explicit graph, not as a call to a third-party directions API.
- Search that graph with A*.
- Explain the result with distance, travel time, and the sequence of roads.
- Run as a web app on Vercel without a database or a paid maps key.

## 3. Goals

1. Correct optimal routes for shortest distance and fastest time, including one-way roads and closures.
2. A map-first interface that is understandable on a phone and on a desktop.
3. A small, documented HTTP API so the algorithm is usable without the UI.
4. A city dataset large enough that the chosen route is not obvious (on the order of 50–80 intersections).
5. One-command local run and a Vercel deployment that serves both the UI and the API.
6. Automated tests that lock the optimality claims.

## 4. Non-goals

- Live GPS tracking, turn-by-turn voice guidance, or background location.
- Real-time traffic feeds (Google, TomTom, HERE) or live probe data.
- User accounts, payments, or a database.
- Turn-restricted maneuvers more detailed than directed edges (no separate turn-penalty tables in v1).
- Native iOS/Android apps.
- A general GIS editor. Users can close or slow a road; they do not draw a new city.
- Importing an entire metropolitan OSM extract. The bundled city is curated.
- Using NetworkX, OSRM, pgRouting, or any routing library to compute the path. Those libraries may appear only in a test that cross-checks a tiny fixture, and they must not ship in `requirements.txt`.

## 5. Users and jobs

| User | Job |
| --- | --- |
| Visitor | Go from one place to another and trust the time and distance. |
| Visitor on a phone | Do the same task with one hand, without a dense desktop layout. |
| Operator / student | Close a bridge or raise congestion and see the path switch. |
| Developer | `POST /api/route` with two node ids and parse a stable JSON path. |

## 6. Product decisions

**Name.** Sandhani.

**City.** One bundled city, *Sandhani City*, about 4 km across, on a real latitude/longitude box so distances are GPS distances. Roads are hand-authored and rendered by the app. Do not put the graph on top of OpenStreetMap tiles: the drawn roads would not match the tiles. The map is a custom SVG whose geometry is projected from the same coordinates as the graph.

**Search.** A* is the default. Dijkstra (A* with a zero heuristic) is available as a comparison so the UI can show that both find the same best cost and that A* expands fewer nodes.

**What “best” means.**

| Objective | Edge weight | Heuristic (must be admissible) |
| --- | --- | --- |
| Shortest | `length_m` | Haversine distance between the node and the goal, in meters |
| Fastest | Travel time in seconds under the active traffic profile | Haversine meters / `v_max`, where `v_max` is the fastest speed any edge can reach under the current profile, in m/s |

**Invariant.** For every edge, `length_m` is greater than or equal to the haversine distance between its endpoints. The data loader rejects a city that breaks this. That keeps the distance heuristic admissible.

**Traffic.** No external feed. Each road class has a multiplier for four departure bands: night, midday, morning peak, evening peak. The user picks a departure time. A multiplier of 0.5 means the road is driven at half the free-flow speed. Users may also mark an edge closed or set a temporary speed factor.

**Ties.** When two partial paths have the same f-score, break ties by smaller h, then by node id ascending, so the same query always returns the same path.

**No accounts.** Recent route queries and the last map position live in `localStorage` only.

## 7. User-facing behavior

### 7.1 Layout

- Desktop: map on the left (about two-thirds), a scrollable plan panel on the right.
- Narrow screens (under 800 px): map on top (at least 46 vh), plan panel below. The panel must not cover the map permanently.
- The route is drawn on the map as a high-contrast line. Start and end are labeled. The rest of the network is visible and quieter.
- A road closure is drawn differently (dashed or muted) so the cause of a detour is visible.

### 7.2 Planning a route

1. The app loads Sandhani City and fits the map to the city.
2. The user sets an origin and a destination by:
   - typing in a place search (matches name and aliases, keyboard up/down/enter), or
   - clicking the map (snaps to the nearest intersection within 180 m; otherwise show “No intersection here”).
3. The user chooses Shortest or Fastest (Fastest is the default).
4. The user chooses a departure: Now, or a clock time that selects night / midday / morning peak / evening peak. “Now” uses the browser’s local hour.
5. Submitting shows one route. Changing either endpoint, the objective, or the departure recomputes.

Empty and error states, in the panel, in plain language:

- Origin or destination missing.
- Origin and destination are the same node: distance 0, time 0, no driving steps.
- No path (disconnected, or the only roads are closed).
- API failure: keep the last good route on the map and say that refresh failed.

### 7.3 Route result

The panel shows:

- A one-line summary: “18 min, 7.4 km via Harbor Bridge”.
- Stats: distance, estimated time, traffic delay versus free-flow, number of turns, nodes expanded by the search.
- A comparison line when the other objective would differ: “Shortest is 1.1 km shorter and 6 min slower.”
- Turn-by-turn steps. Group consecutive edges that share a road name into one step. Each step has the road name, the distance of that step, and a side (left / right / straight) computed from the geometry at the junction. The first step is “Start at {place}” and the last is “Arrive at {place}”.
- A short reason, built from the edges actually used, not from a language model. Examples: “Uses the highway to skip 9 signalized blocks.” “Harbor Bridge is closed, so this crosses at Mill Causeway.”

Actions:

- Swap origin and destination.
- Copy a share link. The link encodes city, origin, destination, objective, departure band, and closure ids in the query string. Opening the link restores that query and runs it.
- Clear the route.

### 7.4 Traffic and closures

- A “Conditions” section lists closures the user has added and a control to clear them.
- Clicking a road on the map selects it and offers Close and Slow to 40%. Closing an edge removes it from the searched graph (both directions if the user closes an undirected pair; one-way roads close in their only direction).
- Preset scenarios, as buttons, not as a separate app:
  - Clear afternoon (midday multipliers, no closures).
  - Evening peak.
  - Harbor Bridge closed.
  - Harbor Bridge closed during evening peak.
- Applying a preset sets the controls and recomputes if a route is already showing.

### 7.5 Search transparency

A disclosure titled “How this route was searched” shows:

- Algorithm name (A*).
- Objective and the unit of the edge weight.
- Nodes expanded versus nodes in the graph.
- Optimal cost.
- A toggle “Compare with Dijkstra” that calls the compare endpoint and shows both costs (they must match) and both expansion counts.

This is a teaching surface for the assigned algorithm, placed behind a disclosure so it does not compete with the trip summary.

### 7.6 Accessibility and quality

- All controls are real buttons, inputs, and lists. The map click is an extra, not the only way to set a place.
- Visible keyboard focus. Place search works with the keyboard.
- Text and the route line meet WCAG AA contrast on the map surface (route line at least 4.5:1 against the land fill).
- Do not depend on color alone for start versus end (use label text and different shapes).
- Honor `prefers-reduced-motion`: no animated camera flights; fit the bounds in one jump.
- The UI must be usable at 375 px wide and at 1280 px wide.

## 8. Functional requirements

Each item is testable.

| ID | Requirement |
| --- | --- |
| F-1 | The server loads Sandhani City at startup and refuses to boot if the graph invariant fails. |
| F-2 | `POST /api/route` returns an optimal path for `shortest` and for `fastest`. |
| F-3 | One-way edges are never traversed backward. |
| F-4 | A closed edge is never in a path. If closure disconnects the graph, the API returns a typed error. |
| F-5 | Departure band changes travel time and can change the fastest path. It does not change the shortest path’s geometry. |
| F-6 | Start equal to goal returns an empty edge list and zero cost, with HTTP 200. |
| F-7 | Unknown node id, unknown city, or a bad body returns HTTP 422 or 404 with `{ "error": { "code", "message" } }`. No stack traces in the body. |
| F-8 | The same request returns the same path (stable tie-break). |
| F-9 | The UI can set both endpoints from search and from the map, draw the path, and list steps. |
| F-10 | Share links restore and run the query. |
| F-11 | Swap, clear, presets, and per-road close/slow work without a reload. |
| F-12 | Dijkstra comparison reports equal optimal cost and its own expansion count. |
| F-13 | Recent queries (up to 8) persist in `localStorage` and can be replayed. |

## 9. Algorithm requirements

Implement A* in `src/sandhani/search/astar.py`. Do not wrap a library.

- Input: adjacency list, start id, goal id, `weight(edge, context) -> float`, `heuristic(node, goal, context) -> float`.
- A weight of `inf` means the edge is closed and is skipped.
- Use a binary heap. Store `(f, h, node_id, counter)` so the heap order matches the tie-break in section 6.
- Reconstruct the path from parent pointers. The path is a list of node ids. Also return the list of edges, total cost, and `nodes_expanded` (nodes popped from the open set).
- If the goal is never dequeued, return “no path”. Do not return a partial path.
- Heuristics live in `src/sandhani/search/heuristic.py` and must match section 6. Document in a module docstring why each one is admissible and consistent.
- Dijkstra is the same function with heuristic 0. Do not keep a second search implementation.
- Floating point: compare costs with a tolerance of `1e-6` meters or seconds in tests. Internally use Python floats; edge lengths are stored as integer meters so the shortest-path cost is exact in practice.

Complexity to state in the README the implementation adds: O(E log V) with a binary heap.

## 10. Data model

City file: `data/sandhani_city.json`.

```json
{
  "id": "sandhani-city",
  "name": "Sandhani City",
  "crs": "EPSG:4326",
  "bounds": { "south": 0, "west": 0, "north": 0, "east": 0 },
  "vmax_kph": 100,
  "bands": {
    "night": { "local": 1.05, "arterial": 1.0, "highway": 0.95, "bridge": 1.0 },
    "midday": { "local": 0.85, "arterial": 0.75, "highway": 0.9, "bridge": 0.8 },
    "peak_am": { "local": 0.7, "arterial": 0.5, "highway": 0.65, "bridge": 0.45 },
    "peak_pm": { "local": 0.65, "arterial": 0.45, "highway": 0.6, "bridge": 0.35 }
  },
  "nodes": [
    {
      "id": "n01",
      "name": "Harbor Station",
      "aliases": ["station", "rail"],
      "lat": 0,
      "lon": 0,
      "kind": "place"
    }
  ],
  "edges": [
    {
      "id": "e01",
      "from": "n01",
      "to": "n02",
      "name": "Quay Street",
      "length_m": 420,
      "free_flow_kph": 40,
      "road_class": "arterial",
      "one_way": true
    }
  ],
  "scenarios": [
    {
      "id": "bridge-closed",
      "name": "Harbor Bridge closed",
      "band": null,
      "closures": ["e-bridge-n", "e-bridge-s"]
    }
  ]
}
```

Node `kind` is `place` (shown in search) or `junction` (map-only). At least 18 nodes are places, including two hospitals, a station, a campus, a port gate, and residential names a person would actually type.

Edge `road_class` is one of `local`, `arterial`, `highway`, `bridge`.

Travel time for an edge:

```text
speed_kph = free_flow_kph * band_multiplier[road_class] * user_factor
time_s    = length_m / (speed_kph * 1000 / 3600)
```

`user_factor` defaults to 1. Slow to 40% sets it to 0.4. A closure sets the weight to infinity.

City content rules:

- 50 to 80 nodes, 80 to 140 directed edges.
- At least one highway corridor, one bridge that is a shortcut, a parallel surface route, and a one-way pair downtown.
- At least one case where evening peak prefers a different path than night, and one case where closing the bridge forces a detour of more than 600 m.
- Place names are unique. Node ids are stable `n` + two digits (or more if needed). Edge ids are stable.

Loader validation (`src/sandhani/graph/validate.py`):

- Unique node and edge ids. Every endpoint exists.
- `length_m >= 15` and `length_m` is at least the haversine length (tolerance 1 m).
- `free_flow_kph` between 15 and `vmax_kph`.
- Band multipliers in `(0, 1.2]`.
- The undirected version of the graph is connected when nothing is closed.
- Scenario edge ids exist.

## 11. HTTP API

Base path: `/api`. JSON only. CORS is unnecessary (same origin).

### `GET /api/health`

`200` `{ "status": "ok", "city": "sandhani-city" }`

### `GET /api/cities`

`200` `{ "cities": [{ "id", "name", "place_count" }] }`

### `GET /api/cities/{city_id}`

`200` with the city JSON used by the UI (nodes, edges, bands, scenarios, bounds). `404` if missing.

### `POST /api/route`

```json
{
  "city_id": "sandhani-city",
  "origin": "n01",
  "destination": "n20",
  "objective": "fastest",
  "band": "peak_pm",
  "closures": ["e-bridge-n"],
  "slowdowns": [{ "edge_id": "e12", "factor": 0.4 }]
}
```

`band` is `night` | `midday` | `peak_am` | `peak_pm`.

`200`:

```json
{
  "algorithm": "astar",
  "objective": "fastest",
  "band": "peak_pm",
  "origin": { "id": "n01", "name": "Harbor Station" },
  "destination": { "id": "n20", "name": "North Campus" },
  "nodes": ["n01", "n02"],
  "edges": [
    {
      "id": "e01",
      "name": "Quay Street",
      "from": "n01",
      "to": "n02",
      "length_m": 420,
      "time_s": 48.2,
      "road_class": "arterial"
    }
  ],
  "steps": [
    {
      "type": "depart",
      "instruction": "Start at Harbor Station",
      "edge_ids": [],
      "length_m": 0,
      "time_s": 0
    },
    {
      "type": "continue",
      "instruction": "Continue on Quay Street",
      "maneuver": "straight",
      "edge_ids": ["e01"],
      "length_m": 420,
      "time_s": 48.2
    },
    {
      "type": "arrive",
      "instruction": "Arrive at North Campus",
      "edge_ids": [],
      "length_m": 0,
      "time_s": 0
    }
  ],
  "summary": {
    "distance_m": 420,
    "time_s": 48.2,
    "free_flow_time_s": 38.0,
    "delay_s": 10.2,
    "nodes_expanded": 14,
    "via": "Quay Street"
  },
  "reason": "Surface streets stay faster while the bridge approach is in the evening peak.",
  "alternate_objective": {
    "objective": "shortest",
    "distance_m": 400,
    "time_s": 70.0,
    "same_path": false
  }
}
```

`alternate_objective` is the other objective under the same closures, slowdowns, and band. Omit it only if that search has no path.

No-path response, HTTP `200`:

```json
{ "error": { "code": "no_path", "message": "No road connects these places with the current closures." } }
```

Use `200` so the UI can treat it as a result. Malformed input is `422`. Unknown ids are `404`.

### `POST /api/route/compare`

Same body as `/api/route`. Returns both algorithms:

```json
{
  "astar": { "cost": 1.0, "nodes_expanded": 10, "nodes": ["n01"] },
  "dijkstra": { "cost": 1.0, "nodes_expanded": 40, "nodes": ["n01"] },
  "costs_match": true
}
```

`cost` is meters for shortest and seconds for fastest.

### Errors

```json
{ "error": { "code": "unknown_node", "message": "Unknown origin 'n99'." } }
```

Codes: `unknown_city`, `unknown_node`, `unknown_edge`, `validation_error`, `no_path`.

## 12. Architecture

```text
Browser (public/)                      Vercel static CDN
  index.html, styles.css, app.js
  fetches /api/*  ------------------>  Python function (FastAPI)
                                         api/index.py exports `app`
                                         src/sandhani/*  graph, A*, routing
                                         data/sandhani_city.json
```

Python owns the graph, the search, traffic weights, step generation, and the reason string. The browser owns drawing, place search UX, and `localStorage`. The browser must not reimplement A*. It may compute “nearest node” for a click using node coordinates already fetched from the API, so a click does not need a round trip.

### 12.1 Repository layout

Create exactly this shape (plus the two spec files already at the root):

```text
sandhani/
  PROJECT_REQUIREMENTS.md      # this document
  TOOL_PROMPTS.md              # prompts for coding agents
  README.md                    # how to run, test, and deploy
  requirements.txt
  vercel.json
  pytest.ini
  api/
    index.py                   # FastAPI app object named `app`
  src/
    sandhani/
      __init__.py
      graph/
        model.py               # City, Node, Edge dataclasses
        load.py                # read JSON, call validate
        validate.py
        geo.py                 # haversine, local projection, turn angle
      search/
        astar.py
        heuristic.py
      routing/
        service.py             # route(), compare()
        steps.py               # group edges into maneuvers
        reasons.py             # template sentences from the path
      api/
        schemas.py             # pydantic models
  data/
    sandhani_city.json
  public/
    index.html
    styles.css
    app.js
    favicon.svg
  tests/
    test_astar.py
    test_heuristic.py
    test_validate.py
    test_routing.py
    test_api.py
  scripts/
    check_city.py              # prints node/edge counts and invariant result
```

Rules for that layout:

- `src/` is on `sys.path` via `pytest.ini` `pythonpath = src` and via one path insert in `api/index.py`. Do not package-install during deploy.
- No `node_modules`, no frontend build step, no TypeScript compiler, no bundler.
- `app.js` is one file. Splitting is allowed only if each extra file is a plain script tag in `index.html`.
- Keep route logic out of `api/index.py`. That file only wires HTTP to `routing.service`.

### 12.2 Python dependencies

Pin ranges in `requirements.txt`:

- `fastapi`
- `pydantic` (v2, pulled in by FastAPI; pin it explicitly)
- `uvicorn` (local dev only; safe to include)
- `pytest` and `httpx` (TestClient)

Do not add NumPy, Pandas, NetworkX, GeoPandas, Shapely, or an ORM.

### 12.3 Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8000
```

Open `http://127.0.0.1:8000/`. The FastAPI app mounts `public/` as static files at `/` and exposes routes at `/api/*`. `GET /` returns `public/index.html`.

### 12.4 Vercel

- Runtime: Python 3.12.
- Entry: `api/index.py` must expose a module-level FastAPI instance named `app`.
- Static UI: `public/`.
- `vercel.json` rewrites `/api/(.*)` to the Python app and serves other paths from `public/`, while still letting the Python app serve `/` in local `uvicorn`.
- City JSON ships inside the deployment (it is small). Do not fetch it from GitHub at runtime.
- No environment variables required. Do not invent an API key.
- Confirm the live path prefix. Vercel’s Python builder sometimes mounts the file at `/api`, which would turn a route decorated as `/api/health` into `/api/api/health`. The implementation must pick one prefix and prove it with `vercel dev` or a deployment smoke test: `GET /api/health` returns `200` on both `uvicorn` and Vercel. If the builder strips `/api`, mount the routes so the public URL is still `/api/health` (for example a root app locally and a prefix setting only when `VERCEL=1`). Document the chosen mechanism in the README in four lines.

Out of scope for deploy: Docker, a separate frontend host, serverless function splitting per endpoint.

## 13. Interface specification

Visual tone: a navigation tool, not a dashboard and not a game. Off-white land (`#f4f1ea`), deep water (`#1e3a4c`), roads in warm gray, route in `#c2410c` (dark orange) at 5 px with a 2 px casing. Text is `#1c1917`. One typeface stack: `Georgia` for the place title, `ui-sans-serif, system-ui` for UI. No purple gradient, no glassmorphism, no map library watermark.

Map behavior:

- Project lon/lat to SVG with an equirectangular projection fitted to `bounds`, padding 24 px.
- Pan by drag. Zoom with the wheel and with + / − buttons, clamped so the city cannot be lost (fit is at most 1.15× the city bounds; max zoom shows about 400 m across).
- ResizeObserver refits only when no route is selected. When a route is selected, keep the user’s zoom and pan.
- Edges are clickable with a stroke hit target of at least 12 px.
- Selected road shows its name, class, length, and free-flow speed in the panel.

Place search:

- Client-side, over `kind: "place"` nodes.
- Case-insensitive substring on name and aliases.
- Show up to 6 suggestions.

Copy and numbers:

- Distances: meters under 1000, otherwise one decimal kilometer.
- Times: minutes under 90 minutes, otherwise hours and minutes. Never show raw seconds in the summary. Seconds are fine in JSON.
- The via-road is the longest named step that is not the origin street, falling back to the longest step.

## 14. Testing and acceptance

### 14.1 Unit and API tests

`pytest` must pass with no network.

- Fixture graph of 6 nodes where the optimal shortest path and the optimal fastest path are different and known by hand.
- A* cost equals Dijkstra cost on that fixture and on the full city, for both objectives, for every band, with and without the bridge closed.
- Heuristic never overestimates on 30 random node pairs in the city (compare h(n) to the true shortest-path cost from n to the goal).
- One-way violation test: reverse edge is absent, path never uses it.
- Closure test: the known bridge path disappears and the detour cost is higher.
- Stable path: two calls, identical node lists.
- Validator rejects a too-short edge and a dangling endpoint.
- API tests through `fastapi.testclient.TestClient` cover health, city fetch, a happy route, unknown node, and no-path.

### 14.2 Acceptance scenarios (manual)

1. Search “station”, search “campus”, Fastest, evening peak. A route draws, steps match the highlighted roads, time and distance are non-zero.
2. Switch to Shortest. Distance does not increase. Time may increase. The summary updates.
3. Apply “Harbor Bridge closed”. The line no longer uses the bridge. The reason mentions the closure.
4. Copy the link, open it in a new tab, and see the same endpoints and the same node sequence.
5. Resize to 375 px. Set both endpoints from the search fields only. The route is visible and the steps scroll.
6. `GET /api/health` on the deployed URL returns `200`.

### 14.3 Definition of done

- Layout in section 12.1 exists.
- `pytest` is green.
- `uvicorn` serves the UI and a route that matches a hand-checked pair documented in the README (print the node ids, distance, and time for night + fastest).
- README covers setup, the hand-checked pair, test command, and Vercel deploy (`vercel` from the repo root) plus the `/api` prefix note.
- No routing library in `requirements.txt`.

## 15. Implementation order

Build in this order so each step is runnable:

1. Graph model, haversine, validator, city JSON, `scripts/check_city.py`.
2. A*, heuristics, fixture tests, city optimality tests against Dijkstra.
3. Routing service: weights, steps, reasons, alternate objective.
4. FastAPI routes and API tests. Static mount. Health check in the browser.
5. Map and panel. Wire the happy path.
6. Closures, slowdowns, presets, share links, recents, Dijkstra disclosure.
7. Layout pass at 375 px and 1280 px. README. Vercel config and prefix check.

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| Vercel prefixes `/api` twice | Section 12.4. Smoke-test the public URL. |
| Admissible heuristic broken by a shortcut edge drawn shorter than haversine | Validator plus the random-pair test. |
| Hand-authored city has an accidental disconnected block | Connectivity check on load. |
| UI reimplements search and drifts from the API | Browser only posts the request and draws the response. |
| Scope creep into live traffic or accounts | Section 4 is binding. |

## 17. Source problem, traced to this spec

| `project_req.txt` | Where it is satisfied |
| --- | --- |
| GPS-based route optimization | Nodes carry WGS84 coordinates. Costs use haversine-checked lengths and speeds. |
| Shortest and fastest path | Objectives `shortest` and `fastest`. |
| Graph search, A* | `src/sandhani/search/astar.py`, with Dijkstra as h = 0. |
| City as nodes and weighted edges | `data/sandhani_city.json` and the loader. |
| Traffic weights | Time-of-day bands plus user slowdowns and closures. |
| Code that outputs the best path between two nodes | `POST /api/route` and the map result. |
