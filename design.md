# Design prompt — Sandhani UI

Use this when building or revising `public/`. Product behavior is defined in `PROJECT_REQUIREMENTS.md` sections 7, 8, and 13. This file decides layout, hierarchy, copy, and visual detail. If the two disagree on behavior, follow the requirements. If they disagree on presentation, follow this file.

Paste the prompt below into Grok Build, Codex, or Antigravity after the API from Phase 4 exists. For a visual pass with no code, stop at the “Design deliverable” and skip the file list.

---

## Prompt

```text
Design and implement the Sandhani trip UI. Read PROJECT_REQUIREMENTS.md sections 7, 11, and 13, and read design.md. The API already exists. You are only shaping what a person sees and operates.

Files you may edit: public/index.html, public/styles.css, public/app.js, public/favicon.svg.
Do not edit the search algorithm, the city JSON, or the API schema unless a response field you must show is missing. No React, no bundler, no CSS framework, no map-tile library, no icon font. One stylesheet, one script, SVG for the map and the favicon.

The finished screen is a navigation tool. Someone who has used a maps app should know where to type, where the route is, and what to do next without a tour.

## What this screen is for

One job: choose two places in Sandhani City and understand the best road path.

The eye order is fixed:
1. The route on the map (or the whole city, before a route exists).
2. The sentence that says how long and how far.
3. The two place fields.
4. The steps.
Everything else is secondary and stays quiet: traffic presets, road closure, the A* disclosure.

Do not lead with the algorithm. “Nodes expanded” is a stat, not the headline.

## Frame

Desktop, 1280 px and up:
- The viewport is the app. No document scroll on the body.
- A panel 380 px wide sits on the right, full height, with its own scroll.
- The map fills everything to the left of the panel.
- 1 px solid #e7e5e4 separates them. No drop shadow, no floating card over the map.

Under 800 px:
- Body scrolls as one column.
- Map is the first region, height 52 vh, min-height 280 px, sticky is not required.
- The panel is the next region, full width, padding 16 px, and is never a sheet that covers the map.
- The place fields, objective, departure, and Show route button are reachable without the map eating the screen. 52 vh leaves them on a 700 px-tall phone after a short scroll; that is acceptable. Do not pin a second bar over the map.

1280 px check and 375 px check are both required. At 375 px the map remains visible above the form, type is at least 16 px in inputs (so iOS does not zoom), and the steps scroll inside the page rather than inside a tiny nested box.

## Map

Draw Sandhani City yourself from the city JSON. Equirectangular projection fitted to bounds with 24 px padding. Land is #f4f1ea. Water, if you draw it, is #1e3a4c and sits behind the roads; do not invent a coastline that crosses a road. Parks are optional, fill #d9e2d2, and must not be the brightest thing on the screen.

Roads:
- Casing #57534e at about 7 px, fill #d6d3d1 at about 4 px, in screen pixels at the fit zoom. Keep local streets lighter than arterials. Highway slightly wider. Bridge drawn with a gap in the casing so it reads as a span, not as a new color system.
- One-way: a small chevron along the edge, #78716c, not a label on every segment.
- Closed road: keep the geometry, switch the fill to transparent, dash the casing 4 4, color #a8a29e. The detour must be explainable by looking at the map.
- Slowed road: same geometry, with a short tick pattern. Do not turn it red.
- Selected road, before it is closed: 2 px #1c1917 outline outside the casing.

Route, only after a successful path:
- Draw it above the network. Casing #7c2d12 at 9 px, line #c2410c at 5 px. Round caps.
- #c2410c on #f4f1ea is the route color from the spec. Do not recolor it to blue or purple.
- Do not draw the route as a row of node dots.

Endpoints:
- Start is a 14 px square, fill #1c1917, with the word Start in a 11 px label above it.
- End is a 16 px circle, fill #c2410c, 2 px #1c1917 stroke, with the word End above it.
- Shape plus the word. Color is not the only difference.
- Labels sit on a #fffcf7 chip with 2 px 6 px padding so they survive crossing a road.

Interaction:
- Drag pans. Wheel zooms. On-screen controls, bottom-left of the map, stacked: +, −, Fit. 32 px hit targets, #fffcf7 background, #1c1917 glyph, 1 px #e7e5e4 border.
- Fit shows the city with the 24 px pad. When a route exists, Fit shows the route bounds instead, still with pad.
- Zoom is clamped: the city never becomes a speck (at most 1.15× the fit scale outward) and the closest zoom shows about 400 m across the width.
- prefers-reduced-motion: Fit jumps. No animated zoom.
- Clicking empty land near nothing (no node within 180 m) shows a transient map note “No intersection here” for 2.5 s, bottom-center of the map, then removes it. Do not use alert().
- Clicking a road selects it and opens the road block in the panel. Clicking a node sets origin if origin is empty, otherwise destination, otherwise replaces destination. The field that was just set is focused.

Chrome on the map, top-left, not inside the panel: the word Sandhani in Georgia, 22 px, #1c1917, and under it “Sandhani City” in 13 px #57534e. This is the only display serif. The panel does not repeat a giant title.

Bottom-right of the map, 11 px #78716c: “Schematic map · not a street atlas”.

## Panel

Background #fffcf7. Text #1c1917. Secondary text #57534e. Padding 20 px 18 px 32 px. Font: ui-sans-serif, system-ui. Section gaps 20 px. No cards nested in cards. One column.

Order, top to bottom:

1. Place fields
2. Objective and departure
3. Show route
4. Status (empty, error, or result)
5. Steps, only when a route exists
6. Conditions
7. How this route was searched

Place fields:
- Two inputs, labels “From” and “To”, visually associated, not placeholder-only.
- Each input is 44 px tall, full width, 1 px #d6d3d1 border, 8 px radius, padding 0 12 px 0 36 px. A marker sits inside the left padding: a 8 px square for From, a 8 px circle for To, same fills as the map endpoints.
- Between the fields, flush right, a text button “Swap”. It exchanges the values and recomputes if a route is showing. Disabled styling when both are empty, still visible.
- Typing filters kind:place nodes, case-insensitive, name and aliases, max 6 rows. The list is a real listbox under the field, #fffcf7, 1 px border, each option min-height 40 px. Highlight the active option with #f5f5f4. Keyboard: ArrowUp, ArrowDown, Enter, Escape. Escape closes the list and leaves the typed text. Enter on a highlighted option sets the node and closes the list.
- A chosen place shows its name in the input. Store the node id in a data attribute, not by parsing the label later.
- Mismatch: if the typed text is not a chosen place, Show route reports “Choose a place from the list, or click the map.” Do not silently search a substring.

Objective:
- A two-segment control, full width, 40 px. Segments are buttons: Fastest and Shortest. Fastest is the default and is aria-pressed. The selected segment is #1c1917 on #fffcf7 inverted (background #1c1917, text #fffcf7). The other is transparent with #1c1917 text. Group label “Route preference”, visible.

Departure:
- Label “Leave”. A select with Now, Night, Midday, Morning peak, Evening peak. Now maps from the browser’s local hour: 0–6 night, 7–9 peak_am, 10–15 midday, 16–19 peak_pm, 20–23 night. Changing the select recomputes when a route is already shown.
- Helper line under it, 12 px #57534e, updates with the band: “Evening peak slows the bridge and arterials.” Keep the four strings short and factual.

Primary action:
- Button label “Show route”. Full width, 44 px, background #c2410c, text #fff7ed, 8 px radius, no gradient. After the first success the label stays “Show route”. It is disabled only while the request is in flight, and then the label is “Finding route…”.
- Enter in either place field submits when both places are set.

Secondary actions, a single row under the primary button once both places are set: “Copy link” and “Clear”. Text buttons, 13 px, #57534e, underline on hover, not a second orange button. Clear wipes the route, closures, slowdowns, and the query string, and refits the city. It does not wipe the place names.

## Result block

This region replaces itself. It never stacks stale errors under a new success.

Before the first search, one sentence in #57534e: “Choose a start and an end. You can type a place or click the map.”

Missing endpoint: “Enter both a start and an end.”

Same place: summary “You are already there.” Stats show 0 m and 0 min. No steps. No reason.

No path: “No road connects these places with the current closures.” Keep the map fitted to the city. Do not draw a previous route.

Request failed: leave the last polyline in place. Status line: “Could not refresh the route. The line on the map is the previous one.”

Success:
- Summary is one sentence, 22 px, line-height 1.25, #1c1917. Pattern: “18 min · 7.4 km via Harbor Bridge”. Use the middle dot. via-road comes from the API summary.
- Reason directly underneath, 14 px #57534e, max two lines of the API reason string. No quotation marks, no “AI says”.
- Stats as a single wrapping row of four quiet items, 12 px label over 14 px value: Distance, Time, Delay, Turns. Delay is “none” when under 30 s, otherwise “+6 min”. A fifth item, “Nodes expanded”, sits in the disclosure, not in this row. The requirements list it among stats; show it only inside “How this route was searched” so the trip stays the headline. Also show it in that disclosure as “14 of 62 intersections”.
- If alternate_objective.same_path is false, one text line: “Shortest is 1.1 km shorter and 6 min slower.” The objective name is a button that switches the segment control and recomputes. If the other objective is both longer and slower, omit the line. If same_path is true, the line is “Shortest uses the same roads.” and it is not a button.

Format numbers the way the spec says. Summary never shows seconds. Distance under 1000 m stays in meters (“850 m”), otherwise one decimal kilometer (“7.4 km”).

## Steps

Heading “Directions”, 13 px, #57534e, uppercase tracking only if you can keep it readable; otherwise sentence case. Prefer sentence case.

A real ordered list. Each row is min-height 44 px, a 28 px maneuver slot, then the instruction and the step distance.
- depart: small square icon, instruction from the API.
- arrive: small circle icon.
- straight, left, right: a simple SVG chevron turned to match. The word is still in the instruction (“Left on Quay Street”), so the icon is redundant on purpose.
- Step distance on the right, #57534e, tabular numbers.

The row of the step under the pointer, and the step button when focused, highlights those edge ids on the map by thickening only that part of the route to 8 px. Hovering the map route does the reverse: scroll the matching step into view only if prefers-reduced-motion is not set; otherwise just set aria-current.

## Conditions

Heading “Conditions”. This section is always present and always below the result, so a closure can be made before the first route.

Presets are a wrapping row of real buttons, 32 px tall, 1 px #d6d3d1, 999 px radius, 13 px text: Clear afternoon, Evening peak, Harbor Bridge closed, Bridge closed at peak. The active preset uses the same selected treatment as the segment control. Applying one sets the departure and the closures, clears slowdowns, and recomputes if both places are set.

Selected-road block, only when a road is selected:
- Name, 16 px.
- One meta line: “Arterial · 420 m · 40 km/h”.
- Two buttons: “Close road” and “Slow to 40%”. If that edge is already closed, the first button reads “Reopen”. If it is already slowed, the second reads “Restore speed”.
- Closing a one-way closes that edge. Closing a two-way pair closes both edge ids that share the same road name and the same two endpoints. Say so in the meta line only when you did: “Both directions”.

Under that, a list of active changes. Each item: road name, “Closed” or “Slowed”, and “Remove”. If the list is empty: “No closures or slowdowns.” A final text button “Clear conditions” is disabled when the list is empty.

## How this route was searched

A native disclosure. Summary text: “How this route was searched”. Closed by default. Inside, after a route exists:
- “A* search”
- “Weight is travel time in seconds” or “Weight is distance in meters”
- “Expanded 14 of 62 intersections”
- “Best cost 1,082 s” or the meter cost, as a number with unit. This is the one place raw seconds are allowed on screen.
- A checkbox “Compare with Dijkstra”. When checked, call the compare endpoint and add two lines: “Dijkstra expanded 40. Costs match.” or “Costs do not match.” If they do not match, that is a bug to surface, not to hide.

Before a route exists, the disclosure body is “Plan a route to see the search.”

## Recents

Under the place fields, only when localStorage has entries and both inputs are empty: a line “Recent” and up to 8 text buttons “Harbor Station to North Campus”. Activating one fills the fields, the objective, the band, and the conditions, then searches. Cap 8, newest first. Do not show this list while the user is typing.

## Share link

Copy link writes the current query to the clipboard and changes its label to “Copied” for 2 seconds. Query keys: city, from, to, objective, band, closed (comma-separated edge ids), slow (edgeId:factor pairs comma-separated). Opening that URL fills the controls and searches once. Invalid ids: drop the bad id, still search if both endpoints remain, and show “One saved road is no longer in the city.” only if something was dropped.

## Focus, hit area, contrast

- Every control is a button, input, select, checkbox, or summary/details. No div clicks without a key handler.
- :focus-visible is a 2 px solid #c2410c outline, offset 2 px. Do not remove outlines.
- Map controls and listbox options are at least 32 px, primary controls 44 px.
- Text on the panel is #1c1917 or #57534e on #fffcf7. Do not use gray below #57534e for anything the user must read.
- The route line is the spec orange on the spec land color. Do not put a tinted overlay across the map.

## Copy you must not invent around

Use these strings when the situation matches. Do not add slogans, empty-state illustrations, or “Welcome to Sandhani”.

- Idle: “Choose a start and an end. You can type a place or click the map.”
- Need both: “Enter both a start and an end.”
- Bad text: “Choose a place from the list, or click the map.”
- Snap miss: “No intersection here”
- Same place: “You are already there.”
- No path: “No road connects these places with the current closures.”
- Refresh failed: “Could not refresh the route. The line on the map is the previous one.”
- Button: “Show route” / “Finding route…”
- Disclosure: “How this route was searched”

## Do not

- Do not build a dashboard, a sidebar of charts, a hero banner, or a landing page above the map.
- Do not use a purple gradient, glass blur, neon route, dark-mode theme, or a second typeface.
- Do not put Google-like pin drops, fake traffic colors (green/yellow/red jam), or OSM tiles under the schematic.
- Do not show node ids in the default UI. Ids may appear in the disclosure as part of a copied debug line only if the compare call fails.
- Do not add settings, accounts, a legend that repeats every road class in a large key, or a splash screen.
- Do not animate the route drawing in.

## Design deliverable

Implement the three public files so the screen matches this prompt at 1280 px and at 375 px.

Then check, in a browser, in this order:
1. Idle state: city fitted, idle sentence, Fastest selected, no polyline.
2. Type a place, see at most 6 suggestions, pick one with the keyboard.
3. Set the other end from the map. Show route. Summary, reason, four stats, and steps appear. Start is a labeled square, End is a labeled circle.
4. Switch to Shortest. The summary updates from the new response.
5. Turn on Harbor Bridge closed. The bridge is dashed and is not under the orange line.
6. Open the disclosure and compare with Dijkstra.
7. Copy link, reload, see the same trip.
8. At 375 px, repeat steps 2 and 3 using only the inputs.

Fix anything in that list before you stop. Do not restyle past this prompt.
```

---

## Follow-up, if the UI looks busy or generic

```text
Look at the Sandhani screen you just built and compare it with design.md. Do not add features.

Fix only presentation drift:
- One job on the screen: two places and a route.
- Map is the city, panel is 380 px on the right, stacked under 800 px with the map at 52 vh.
- Colors are the land, water, ink, and route values in design.md. No extra palette.
- The first text in the result is the “18 min · 7.4 km via …” sentence, not a card title and not the node count.
- Conditions and the A* disclosure sit below the steps and start closed or quiet.
- Empty, same-place, no-path, and failed-refresh each use the sentence in design.md.

Reload and repeat checks 1, 3, 5, and 8 from the design prompt.
```
