"use strict";

const $ = (id) => document.getElementById(id);
const map = $("map");
const fields = ["origin", "destination"];
const endpoints = { origin: "", destination: "" };
const camera = { width: 1, height: 1, x: 0, y: 0, scale: 1, fit: 1 };
const svgNS = "http://www.w3.org/2000/svg";
const points = new Map();
const nodes = new Map();
const roads = [];
const closures = new Set();
const slowdowns = new Map();
const edges = new Map();
const PRESET_LABELS = {
  "clear-afternoon": "Clear afternoon",
  "evening-peak": "Evening peak",
  "bridge-closed": "Harbor Bridge closed",
  "bridge-closed-evening": "Bridge closed at peak",
};
const CLASS_LABEL = { local: "Local", arterial: "Arterial", highway: "Highway", bridge: "Bridge" };
const RECENTS_KEY = "sandhani.recents";
const recentsKey = () => city.id === "sandhani-city" ? RECENTS_KEY : `${RECENTS_KEY}.${city.id}`;
let city;
let bounds;
let projectPoint;
const edgePaths = new Map();
let activeField = "origin";
let trip = null;
let planned = false;
let requestVersion = 0;
let gesture;
let mapMessageTimer;
let currentQuery;
const idle = "Choose a start and an end. You can type a place or click the map.";
let selectedRoad = null;
let shareNote = "";
let compareOn = false;

function svg(tag, attributes = {}, parent, label) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (label) element.textContent = label;
  if (parent) parent.append(element);
  return element;
}

function distance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function duration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (seconds > 0 && minutes === 0) return "<1 min";
  return seconds < 5400 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function edgePath(edge) {
  if (!edgePaths.has(edge.id)) {
    const shape = (edge.geometry || []).map(([lat, lon]) => projectPoint(lat, lon));
    const vertices = [points.get(edge.from), ...shape, points.get(edge.to)];
    edgePaths.set(edge.id, `M${vertices.map((point) => point.join(",")).join("L")}`);
  }
  return edgePaths.get(edge.id);
}

function initializeMap() {
  const { south, west, north, east } = city.bounds;
  const latMeters = Math.PI * 6371000 / 180;
  const lonMeters = latMeters * Math.cos((north + south) / 2 * Math.PI / 180);
  bounds = [(east - west) * lonMeters, (north - south) * latMeters];
  projectPoint = (lat, lon) => [(lon - west) * lonMeters, (north - lat) * latMeters];
  for (const node of city.nodes) {
    nodes.set(node.id, node);
    points.set(node.id, projectPoint(node.lat, node.lon));
  }

  function terrainPath(normalized, fill) {
    const [w, h] = bounds;
    const d = normalized.map(([x, y], i) => `${i ? "L" : "M"}${x * w},${y * h}`).join("") + "Z";
    svg("path", { d, fill }, $("terrain"));
  }

  if (city.id === "sandhani-city") {
    terrainPath([[-4,.46], [.11,.446], [.26,.488], [.47,.471], [.64,.486], [.84,.457], [5,.444],
      [5,.569], [.84,.572], [.65,.558], [.47,.566], [.26,.555], [.10,.567], [-4,.58]], "#1e3a4c");
    terrainPath([[.63,.08],[.75,.072],[.83,.15],[.78,.235],[.65,.2],[.60,.13]], "#e2e5d6");
    terrainPath([[.03,.27],[.15,.26],[.18,.33],[.15,.41],[.07,.40]], "#e2e5d6");
    terrainPath([[.74,.63],[.84,.60],[.92,.67],[.89,.73],[.77,.72]], "#e2e5d6");
    terrainPath([[.30,.69],[.37,.67],[.45,.70],[.45,.77],[.32,.78]], "#eddfca");
    terrainPath([[.05,.79],[.13,.79],[.16,.89],[.14,.96],[.035,.94]], "#eddfca");
  }
  for (const polygon of city.water || []) {
    const d = polygon.map(([lat, lon], index) => `${index ? "L" : "M"}${projectPoint(lat, lon).join(",")}`).join("") + "Z";
    svg("path", { d, fill: "#1e3a4c" }, $("terrain"));
  }

  const physicalRoads = new Map();
  for (const edge of city.edges) {
    edges.set(edge.id, edge);
    const pair = edge.segment_id || [edge.from, edge.to].sort().join("/");
    if (!edge.one_way && physicalRoads.has(pair)) {
      physicalRoads.get(pair).edges.push(edge);
      continue;
    }
    const d = edgePath(edge);
    const border = svg("path", { d, class: `road-border ${edge.road_class}` }, $("roads"));
    const path = svg("path", { d, class: `road ${edge.road_class}` }, $("roads"));
    const target = svg("path", { d, class: "road-target", "data-edge": edge.id }, $("road-targets"));
    svg("title", {}, target, edge.name);
    const road = { edges: [edge], path, border, target };
    if (!edge.one_way) physicalRoads.set(pair, road);
    roads.push(road);
  }
  for (const [id, [x, y]] of points) {
    if (city.source && nodes.get(id).kind !== "place") continue;
    svg("circle", { cx: x, cy: y, r: 10, fill: nodes.get(id).kind === "place" ? "#716658" : "#b3a696" }, $("roads"));
  }
  new ResizeObserver(resizeMap).observe(map);
}

function mapLabel(parent, x, y, label, className, attrs = {}, decoration) {
  const group = svg("g", { transform: `translate(${x},${y}) scale(${1 / camera.scale})` }, parent);
  if (decoration) decoration(group);
  svg("text", { class: className, ...attrs }, group, label);
}

function paintLabels() {
  $("map-labels").replaceChildren();
  if (city.source && (trip || endpoints.origin || endpoints.destination)) return;
  const [w, h] = bounds;
  const labels = city.source ? [] : [
    [.52,.515,"SANDHANI RIVER","water-label"],
    [.69,.116,"Ridge Expressway",""],
    [.23,.48,"Harbor Bridge","water-label"],
    [.67,.548,"Mill Causeway","water-label"],
  ];
  for (const [x, y, text, style] of labels) {
    if (camera.width < 500 && text === "SANDHANI RIVER") continue;
    mapLabel($("map-labels"), x * w, y * h, text, `map-label ${style}`, { "text-anchor": "middle" });
  }
  const names = camera.width < 500
    ? ["Harbor Station", "North Campus", "Port Gate"]
    : ["Harbor Station", "North Campus", "St. Anne Hospital", "Port Gate", "Hillview Estate", "Old Town", "Grove Park"];
  for (const node of city.nodes) {
    if (node.kind !== "place") continue;
    const labelAtFit = city.source
      ? ["Howrah Station", "Esplanade", "Howrah Maidan", "Maidan"].includes(node.name)
      : names.includes(node.name);
    if (!labelAtFit && camera.scale <= camera.fit * 1.65) continue;
    if ((trip ? [trip.origin.id, trip.destination.id] : Object.values(endpoints)).includes(node.id)) continue;
    const [x, y] = points.get(node.id);
    const alignRight = x / w > .73;
    mapLabel($("map-labels"), x, y, node.name, "map-label",
      { x: alignRight ? -7 : 7, y: -7, "text-anchor": alignRight ? "end" : "start" });
  }
}

function paintMarkers() {
  $("markers").replaceChildren();
  const visible = trip ? {origin: trip.origin.id, destination: trip.destination.id} : endpoints;
  for (const field of fields) {
    if (!visible[field]) continue;
    const node = nodes.get(visible[field]);
    const [x, y] = points.get(node.id);
    const same = visible.origin === visible.destination;
    const origin = field === "origin";
    const label = same ? "Start & end" : origin ? "Start" : "End";
    if (same && !origin) continue;
    const screenX = camera.x + x * camera.scale;
    const screenY = camera.y + y * camera.scale;
    const alignRight = screenX > camera.width / 2;
    const name = node.kind === "junction" && city.source ? "Pinned intersection" : node.name;
    const offset = alignRight ? -12 : 12;
    mapLabel($("markers"), x, y, `${label} · ${name}`, "marker-label",
      { x: offset, y: screenY < 110 ? 23 : -12, "text-anchor": alignRight ? "end" : "start" }, (group) => {
        if (origin) svg("rect", { x: -7, y: -7, width: 14, height: 14, fill: "#1c1917", stroke: "white", "stroke-width": 2 }, group);
        else svg("circle", { r: 8, fill: "#c2410c", stroke: "#1c1917", "stroke-width": 2 }, group);
      });
  }
}

function paintCamera() {
  const [w, h] = bounds;
  const margin = 36;
  camera.x = Math.min(Math.max(camera.x, margin - w * camera.scale), camera.width - margin);
  camera.y = Math.min(Math.max(camera.y, margin - h * camera.scale), camera.height - margin);
  $("world").setAttribute("transform", `translate(${camera.x},${camera.y}) scale(${camera.scale})`);
  const range = [2000, 1000, 500, 200, 100, 50].find((meters) => meters * camera.scale <= 110) || 50;
  $("scale").style.width = `${Math.max(44, range * camera.scale)}px`;
  $("scale").textContent = distance(range);
  paintLabels();
  paintMarkers();
}

function saveCamera() {
  const position = {
    scale: camera.scale,
    x: (camera.width / 2 - camera.x) / camera.scale,
    y: (camera.height / 2 - camera.y) / camera.scale,
  };
  try { localStorage.setItem(`sandhani.map.${city.id}`, JSON.stringify(position)); } catch { /* Private mode. */ }
}

function restoreCamera() {
  try {
    const position = JSON.parse(localStorage.getItem(`sandhani.map.${city.id}`));
    if (!position || ![position.scale, position.x, position.y].every(Number.isFinite)) return;
    camera.scale = Math.max(camera.fit / 1.15, Math.min(camera.width / 400, position.scale));
    camera.x = camera.width / 2 - position.x * camera.scale;
    camera.y = camera.height / 2 - position.y * camera.scale;
    paintCamera();
  } catch { /* Private mode or invalid data. */ }
}

function fitMap() {
  camera.scale = camera.fit;
  camera.x = (camera.width - bounds[0] * camera.scale) / 2;
  camera.y = (camera.height - bounds[1] * camera.scale) / 2;
  paintCamera();
}

function resizeMap() {
  const { width, height } = map.getBoundingClientRect();
  if (!width || !height || (width === camera.width && height === camera.height)) return;
  const deltaX = (width - camera.width) / 2;
  const deltaY = (height - camera.height) / 2;
  camera.width = width;
  camera.height = height;
  camera.fit = Math.min((width - 48) / bounds[0], (height - 48) / bounds[1]);
  if (!trip) fitMap();
  else {
    camera.x += deltaX;
    camera.y += deltaY;
    paintCamera();
  }
}

function zoom(factor, x = camera.width / 2, y = camera.height / 2) {
  const scale = Math.max(camera.fit / 1.15, Math.min(camera.width / 400, camera.scale * factor));
  const ratio = scale / camera.scale;
  camera.x = x - (x - camera.x) * ratio;
  camera.y = y - (y - camera.y) * ratio;
  camera.scale = scale;
  paintCamera();
  saveCamera();
}

function mapMessage(message) {
  $("map-message").textContent = message;
  clearTimeout(mapMessageTimer);
  mapMessageTimer = setTimeout(() => { $("map-message").textContent = ""; }, 2800);
}

function selectMapNode(x, y) {
  const mapX = (x - camera.x) / camera.scale;
  const mapY = (y - camera.y) / camera.scale;
  let nearest = "";
  let gap = 180;
  for (const [id, [nodeX, nodeY]] of points) {
    const offset = Math.hypot(nodeX - mapX, nodeY - mapY);
    if (offset <= gap) {
      gap = offset;
      nearest = id;
    }
  }
  if (nearest) {
    const field = activeField;
    setEndpoint(field, nearest);
    $(field).focus({ preventScroll: true });
    activeField = !endpoints.origin ? "origin" : "destination";
    return true;
  }
  return false;
}

function enableMap() {
  $("zoom-in").onclick = () => zoom(1.35);
  $("zoom-out").onclick = () => zoom(1 / 1.35);
  $("fit").onclick = () => {
    if (!trip?.edges.length) {
      fitMap();
      saveCamera();
      return;
    }
    const box = $("route-path").getBBox();
    const { x: left, y: top, width, height } = box;
    camera.scale = Math.min((camera.width - 48) / (width || 1),
      (camera.height - 48) / (height || 1), camera.width / 400);
    camera.x = (camera.width - width * camera.scale) / 2 - left * camera.scale;
    camera.y = (camera.height - height * camera.scale) / 2 - top * camera.scale;
    paintCamera();
    saveCamera();
  };
  map.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = map.getBoundingClientRect();
    zoom(Math.exp(-Math.max(-180, Math.min(event.deltaY, 180)) / 400),
      event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  map.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: camera.x, top: camera.y, drag: false, target: event.target };
    map.setPointerCapture(event.pointerId);
  });
  map.addEventListener("pointermove", (event) => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.drag && Math.hypot(dx, dy) < 5) return;
    gesture.drag = true;
    map.classList.add("dragging");
    camera.x = gesture.left + dx;
    camera.y = gesture.top + dy;
    paintCamera();
  });
  function endGesture(event) {
    if (gesture?.id !== event.pointerId) return;
    const done = gesture;
    gesture = undefined;
    map.classList.remove("dragging");
    if (done.drag) saveCamera();
    if (!done.drag && event.type === "pointerup") {
      const rect = map.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const hit = done.target.closest?.(".road-target");
      const edge = hit && edges.get(hit.dataset.edge);
      const atEndpoint = edge && [edge.from, edge.to].some((id) => {
        const [px, py] = points.get(id);
        return Math.hypot(x - camera.x - px * camera.scale, y - camera.y - py * camera.scale) <= 9;
      });
      if (edge && !atEndpoint) selectRoad(edge.id);
      else if (!selectMapNode(x, y)) mapMessage("No intersection here");
    }
  }
  map.addEventListener("pointermove", (event) => {
    if (gesture || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const edgeId = event.target.closest?.(".road-target")?.dataset.edge;
    focusStep(edgeId);
  });
  map.addEventListener("pointerup", endGesture);
  map.addEventListener("pointercancel", endGesture);
}

function setEndpoint(field, id, refresh = true) {
  endpoints[field] = id;
  $(field).value = nodes.get(id)?.name || "";
  $(field).dataset.nodeId = id;
  activeField = !endpoints.origin ? "origin" : "destination";
  paintMarkers();
  $("copy-link").hidden = !(endpoints.origin && endpoints.destination);
  renderRecents();
  if (refresh && planned) planTrip();
}

function bindSearch(field) {
  const input = $(field);
  const list = $(`${field}-options`);
  let matches = [];
  let selected = -1;
  function close() {
    selected = -1;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  function choose(node) {
    close();
    setEndpoint(field, node.id);
    if (field === "origin" && !endpoints.destination) $("destination").focus();
  }
  function suggest() {
    if (endpoints[field]) return close();
    const query = input.value.trim().toLowerCase();
    if (!query) return close();
    const places = city.nodes.filter((node) => node.kind === "place");
    const priority = (node) => node.name.toLowerCase() === query ? 0
      : node.name.toLowerCase().startsWith(query) ? 1 : 2;
    matches = places.filter((node) => [node.name, ...node.aliases]
      .some((name) => name.toLowerCase().includes(query)))
      .sort((left, right) => priority(left) - priority(right)).slice(0, 6);
    list.replaceChildren();
    close();
    matches.forEach((node, index) => {
      const item = document.createElement("li");
      item.id = `${field}-option-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.textContent = node.name;
      button.onpointerdown = (event) => event.preventDefault();
      button.onclick = () => choose(node);
      item.append(button);
      list.append(item);
    });
    if (matches.length) {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
  }
  input.addEventListener("click", suggest);
  input.addEventListener("focus", () => {
    activeField = field;
    suggest();
  });
  input.addEventListener("input", () => {
    endpoints[field] = "";
    input.dataset.nodeId = "";
      setPlanning(false);
    $("copy-link").hidden = true;
    renderRecents();
    activeField = field;
    requestVersion++;
    paintMarkers();
    suggest();
  });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") return close();
    if (list.hidden && ["ArrowDown", "ArrowUp"].includes(event.key)) suggest();
    if (list.hidden) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const increment = event.key === "ArrowDown" ? 1 : -1;
      selected = (selected < 0 && increment < 0) ? matches.length - 1 :
        (selected + increment + matches.length) % matches.length;
      [...list.children].forEach((item, index) => item.setAttribute("aria-selected", String(index === selected)));
      const active = list.children[selected];
      input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(matches[Math.max(0, selected)]);
    }
  });
}

function departureBand() {
  const selection = $("departure").value;
  if (selection !== "clock" && selection !== "now") return selection;
  const hour = selection === "now" ? new Date().getHours() : Number($("clock").value.split(":")[0]);
  if (hour < 7 || hour >= 20) return "night";
  if (hour < 10) return "peak_am";
  if (hour < 16) return "midday";
  return "peak_pm";
}

function setStatus(message) {
  $("status").textContent = message;
  $("status").hidden = !message;
}

function objective() {
  return document.querySelector("input[name=objective]:checked").value;
}

function query() {
  return {
    city_id: city.id,
    origin: endpoints.origin,
    destination: endpoints.destination,
    objective: objective(),
    band: departureBand(),
    closures: [...closures],
    slowdowns: [...slowdowns].map(([edge_id, factor]) => ({ edge_id, factor })),
  };
}

function roadFor(edgeId) {
  return roads.find((road) => road.edges.some((edge) => edge.id === edgeId));
}

function paintConditions() {
  for (const road of roads) {
    const ids = road.edges.map((edge) => edge.id);
    const closed = ids.some((id) => closures.has(id));
    const slow = !closed && ids.some((id) => slowdowns.has(id));
    road.path.classList.toggle("is-closed", closed);
    road.border.classList.toggle("is-closed", closed);
    road.path.classList.toggle("is-slow", slow);
    road.border.classList.toggle("is-selected", road === selectedRoad);
  }
}

function matchingPreset() {
  if (slowdowns.size) return "";
  const closed = [...closures].sort().join(",");
  const band = departureBand();
  const hits = city.scenarios.filter((scenario) => {
    return [...scenario.closures].sort().join(",") === closed && (scenario.band === band || scenario.band == null);
  });
  return (hits.find((scenario) => scenario.band === band) || hits.find((scenario) => scenario.band == null) || {}).id || "";
}

function renderConditions() {
  const active = matchingPreset();
  for (const button of $("presets").children) button.setAttribute("aria-pressed", String(button.dataset.preset === active));
  const box = $("selected-road");
  box.replaceChildren();
  if (!selectedRoad) box.hidden = true;
  else {
    const edge = selectedRoad.edges[0];
    const ids = selectedRoad.edges.map((item) => item.id);
    const closed = ids.every((id) => closures.has(id));
    const slow = ids.every((id) => slowdowns.get(id) === 0.4);
    box.hidden = false;
    const title = document.createElement("strong");
    title.textContent = edge.name;
    const meta = document.createElement("p");
    const both = selectedRoad.edges.length > 1 ? " · Both directions" : "";
    meta.textContent = `${CLASS_LABEL[edge.road_class] || edge.road_class} · ${distance(edge.length_m)} · ${edge.free_flow_kph} km/h${both}`;
    const row = document.createElement("div");
    row.className = "row";
    row.append(
      conditionButton(closed ? "Reopen" : "Close road", () => setRoadState(selectedRoad, closed ? "open" : "close")),
      conditionButton(slow ? "Restore speed" : "Slow to 40%", () => setRoadState(selectedRoad, slow ? "restore" : "slow")),
    );
    box.append(title, meta, row);
  }
  const list = $("condition-list");
  list.replaceChildren();
  const groups = new Map();
  for (const id of closures) rememberChange(groups, id, "Closed");
  for (const id of slowdowns.keys()) if (!closures.has(id)) rememberChange(groups, id, "Slowed");
  if (!groups.size) {
    const item = document.createElement("li");
    item.textContent = "No closures or slowdowns.";
    list.append(item);
  }
  for (const [key, group] of groups) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${group.name} · ${group.label}`;
    item.append(name, conditionButton("Remove", () => {
      for (const id of group.ids) {
        closures.delete(id);
        slowdowns.delete(id);
      }
      conditionsChanged();
    }));
    item.dataset.change = key;
    list.append(item);
  }
  $("clear-conditions").disabled = closures.size === 0 && slowdowns.size === 0;
}

function rememberChange(groups, id, label) {
  const edge = edges.get(id);
  const key = `${edge.name}:${label}`;
  const group = groups.get(key) || { name: edge.name, label, ids: [] };
  group.ids.push(id);
  groups.set(key, group);
}

function conditionButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.onclick = action;
  return button;
}

function setRoadState(road, action) {
  for (const edge of road.edges) {
    closures.delete(edge.id);
    slowdowns.delete(edge.id);
    if (action === "close") closures.add(edge.id);
    if (action === "slow") slowdowns.set(edge.id, 0.4);
  }
  conditionsChanged();
}

function conditionsChanged() {
  paintConditions();
  renderConditions();
  renderDeparture();
  if (planned && endpoints.origin && endpoints.destination) planTrip();
  else writeShareUrl();
}

function clearConditions() {
  closures.clear();
  slowdowns.clear();
  conditionsChanged();
}

function selectRoad(edgeId) {
  selectedRoad = roadFor(edgeId) || null;
  paintConditions();
  renderConditions();
  $("conditions").open = true;
  $("selected-road").scrollIntoView({ block: "nearest" });
}

function applyPreset(scenario) {
  closures.clear();
  slowdowns.clear();
  for (const id of scenario.closures) closures.add(id);
  if (scenario.band) {
    $("departure").value = scenario.band;
    $("clock").hidden = true;
  }
  conditionsChanged();
  if (!planned && endpoints.origin && endpoints.destination) planTrip();
}

function readRecents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentsKey()) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function recentKey(entry) {
  return JSON.stringify([entry.from, entry.to, entry.objective, entry.band, entry.closed, entry.slow]);
}

function rememberTrip() {
  const entry = {
    from: endpoints.origin,
    to: endpoints.destination,
    fromName: nodes.get(endpoints.origin)?.name || "",
    toName: nodes.get(endpoints.destination)?.name || "",
    objective: objective(),
    band: departureBand(),
    closed: [...closures].sort(),
    slow: [...slowdowns].map(([edge_id, factor]) => [edge_id, factor]).sort(),
  };
  const items = [entry, ...readRecents().filter((item) => recentKey(item) !== recentKey(entry))].slice(0, 8);
  try { localStorage.setItem(recentsKey(), JSON.stringify(items)); } catch { /* private mode */ }
  renderRecents();
}

function renderRecents() {
  const box = $("recents");
  const typing = $("origin").value || $("destination").value || endpoints.origin || endpoints.destination;
  const items = readRecents();
  $("recent-list").replaceChildren();
  if (typing || !items.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  for (const item of items) {
    const button = conditionButton(`${item.fromName} to ${item.toName}`, () => replayRecent(item));
    const context = document.createElement("small");
    const bands = { night: "Night", midday: "Midday", peak_am: "Morning peak", peak_pm: "Evening peak" };
    const changed = item.closed?.length || item.slow?.length;
    context.textContent = `${item.objective === "shortest" ? "Shortest" : "Fastest"} · ${bands[item.band] || "Now"}${changed ? " · Road changes" : ""}`;
    button.append(context);
    $("recent-list").append(button);
  }
}

function replayRecent(item) {
  closures.clear();
  slowdowns.clear();
  for (const id of item.closed || []) if (edges.has(id)) closures.add(id);
  for (const [id, factor] of item.slow || []) if (edges.has(id)) slowdowns.set(id, factor);
  document.querySelector(`input[name=objective][value="${item.objective}"]`).checked = true;
  if (["night", "midday", "peak_am", "peak_pm"].includes(item.band)) {
    $("departure").value = item.band;
    $("clock").hidden = true;
  }
  setEndpoint("origin", item.from, false);
  setEndpoint("destination", item.to, false);
  paintConditions();
  renderConditions();
  planTrip();
}

function writeShareUrl() {
  if (!endpoints.origin || !endpoints.destination) return;
  const params = new URLSearchParams({
    city: city.id,
    from: endpoints.origin,
    to: endpoints.destination,
    objective: objective(),
    band: departureBand(),
  });
  if (closures.size) params.set("closed", [...closures].join(","));
  if (slowdowns.size) params.set("slow", [...slowdowns].map(([id, factor]) => `${id}:${factor}`).join(","));
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

function applyShareUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get("city") !== city.id || !params.has("from") && !params.has("to")) return;
  let droppedRoad = false;
  const from = params.get("from");
  const to = params.get("to");
  if (from && nodes.has(from)) setEndpoint("origin", from, false);
  if (to && nodes.has(to)) setEndpoint("destination", to, false);
  const chosen = params.get("objective");
  if (chosen === "fastest" || chosen === "shortest") {
    document.querySelector(`input[name=objective][value="${chosen}"]`).checked = true;
  }
  const band = params.get("band");
  if (["night", "midday", "peak_am", "peak_pm"].includes(band)) $("departure").value = band;
  for (const id of (params.get("closed") || "").split(",").filter(Boolean)) {
    if (edges.has(id)) closures.add(id);
    else droppedRoad = true;
  }
  for (const part of (params.get("slow") || "").split(",").filter(Boolean)) {
    const [id, raw] = part.split(":");
    const factor = Number(raw);
    if (edges.has(id) && factor > 0 && factor <= 1) slowdowns.set(id, factor);
    else droppedRoad = true;
  }
  shareNote = droppedRoad ? "One saved road is no longer in the city." : "";
  renderDeparture();
  paintConditions();
  renderConditions();
  if (endpoints.origin && endpoints.destination) planTrip();
  else if (!endpoints.origin || !endpoints.destination) setStatus("Choose a place from the list, or click the map.");
}

function highlightStep(edgeIds) {
  const d = (edgeIds || []).filter((id) => edges.has(id)).map((id) => edgePath(edges.get(id))).join(" ");
  $("step-highlight").setAttribute("d", d);
}

function focusStep(edgeId) {
  let current = null;
  for (const item of $("steps").children) {
    const hit = edgeId && (item.dataset.edges || "").split(" ").includes(edgeId);
    if (hit) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    if (hit) current = item;
  }
  if (current) current.scrollIntoView({ block: "nearest" });
}

function renderSearch() {
  const body = $("search-body");
  body.replaceChildren();
  if (!trip) {
    body.textContent = "Plan a route to see the search.";
    return;
  }
  const weight = trip.objective === "fastest" ? "Weight is travel time in seconds" : "Weight is distance in meters";
  const cost = trip.objective === "fastest"
    ? `${Math.round(trip.summary.time_s).toLocaleString()} s`
    : `${Math.round(trip.summary.distance_m).toLocaleString()} m`;
  for (const line of ["A* search", weight, `Expanded ${trip.summary.nodes_expanded} of ${city.nodes.length} intersections`, `Best cost ${cost}`]) {
    const row = document.createElement("p");
    row.textContent = line;
    body.append(row);
  }
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = compareOn;
  box.onchange = () => {
    compareOn = box.checked;
    if (compareOn) loadCompare();
    else renderSearch();
  };
  label.append(box, document.createTextNode("Compare with Dijkstra"));
  body.append(label);
  const report = document.createElement("p");
  report.id = "compare-report";
  body.append(report);
  if (compareOn) loadCompare();
}

async function loadCompare() {
  const version = requestVersion;
  const report = $("compare-report");
  if (!report || !currentQuery) return;
  report.textContent = "Comparing…";
  try {
    const result = await api("/api/route/compare", currentQuery);
    if (version !== requestVersion || report !== $("compare-report")) return;
    if (result.error) {
      $("compare-report").textContent = result.error.message;
      return;
    }
    const match = result.costs_match ? "Costs match." : "Costs do not match.";
    const cost = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 3 });
    report.textContent = `A* expanded ${result.astar.nodes_expanded} (cost ${cost(result.astar.cost)}). Dijkstra expanded ${result.dijkstra.nodes_expanded} (cost ${cost(result.dijkstra.cost)}). ${match}`;
  } catch {
    if (version === requestVersion && $("compare-report")) {
      $("compare-report").textContent = "Could not compare the search.";
    }
  }
}

async function api(path, body) {
  const response = await fetch(path, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : undefined);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function planTrip({ focusResult = false } = {}) {
  const version = ++requestVersion;
  if (!endpoints.origin || !endpoints.destination) {
    setPlanning(false);
    const unchosen = fields.some((field) => !endpoints[field] && $(field).value.trim());
    setStatus(unchosen ? "Choose a place from the list, or click the map." : "Enter both a start and an end.");
    if (focusResult) $(fields.find((field) => !endpoints[field])).focus();
    return;
  }
  planned = true;
  const body = query();
  $("plan").disabled = true;
  $("plan").textContent = "Finding route…";
  setStatus("");
  try {
    const result = await api("/api/route", body);
    if (version !== requestVersion) return;
    if (result.error) {
      showTrip(null);
      fitMap();
      setStatus(result.error.message);
      if (focusResult) $("status").focus();
    } else {
      currentQuery = body;
      showTrip(result);
      if (focusResult) $("trip-summary").focus();
      writeShareUrl();
      rememberTrip();
      setStatus(shareNote);
      shareNote = "";
    }
  } catch {
    if (version === requestVersion) setStatus(trip ?
      "Could not refresh the route. The line on the map is the previous one." :
      "The route could not be loaded. Try again.");
  } finally {
    if (version === requestVersion) setPlanning(false);
  }
}

function renderRouteOptions(result) {
  const container = $("route-options");
  container.replaceChildren();
  const alternate = result.alternate_objective;
  container.hidden = !result.edges.length || !alternate;
  if (container.hidden) return;

  const options = [
    { objective: result.objective, ...result.summary },
    alternate,
  ].sort((first, second) => first.objective.localeCompare(second.objective));
  for (const option of options) {
    const selected = option.objective === result.objective;
    const button = conditionButton("", async () => {
      if (selected) return;
      document.querySelector(`input[name=objective][value="${option.objective}"]`).checked = true;
      await planTrip();
      container.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    });
    button.setAttribute("aria-pressed", String(selected));
    const name = document.createElement("strong");
    name.textContent = option.objective === "shortest" ? "Shortest" : "Fastest";
    const cost = document.createElement("span");
    cost.textContent = `${duration(option.time_s)} · ${distance(option.distance_m)}`;
    button.append(name, cost);
    container.append(button);
  }
}

function showTrip(result) {
  trip = result;
  if (!result) currentQuery = null;
  $("step-highlight").removeAttribute("d");
  $("result").hidden = !result;
  const d = result ? result.edges.map((edge) => edgePath(edges.get(edge.id))).join(" ") : "";
  for (const id of ["route-path", "route-casing"]) $(id).setAttribute("d", d);
  map.classList.toggle("has-route", !!result?.edges.length);
  $("route-path").dataset.edges = result?.edges.map((edge) => edge.id).join(" ") || "";
  if (!result) {
    highlightStep([]);
    $("steps").replaceChildren();
    renderSearch();
  }
  paintMarkers();
  paintLabels();
  if (!result) return;
  renderRouteOptions(result);
  $("jump-map").hidden = !result.edges.length;
  const { summary, steps, reason, alternate_objective: alternate } = result;
  const via = summary.via ? ` via ${summary.via}` : "";
  $("trip-summary").textContent = summary.distance_m === 0 && summary.time_s === 0
    ? "You are already there."
    : `${duration(summary.time_s)} · ${distance(summary.distance_m)}${via}`;
  $("reason").hidden = !steps.length;
  $("reason").textContent = reason;
  const turns = steps.filter((step) => step.type === "turn").length;
  const delay = summary.delay_s < 30 ? "none" : `+${duration(summary.delay_s)}`;
  $("stats").replaceChildren();
  for (const [label, value] of [
    ["Distance", distance(summary.distance_m)], ["Time", duration(summary.time_s)],
    ["Delay", delay], ["Turns", turns],
  ]) {
    const stat = document.createElement("div");
    const term = document.createElement("dt");
    const definition = document.createElement("dd");
    term.textContent = label;
    definition.textContent = value;
    stat.append(term, definition);
    $("stats").append(stat);
  }
  $("alternate").hidden = true;
  $("alternate").replaceChildren();
  if (steps.length && alternate?.same_path) {
    $("alternate").hidden = false;
    $("alternate").textContent = `${alternate.objective === "shortest" ? "Shortest" : "Fastest"} uses the same roads.`;
  } else if (steps.length && alternate) {
    const deltaDistance = alternate.distance_m - summary.distance_m;
    const deltaTime = alternate.time_s - summary.time_s;
    const worse = deltaDistance >= -1 && deltaTime >= -1;
    if (!worse) {
      const name = alternate.objective === "shortest" ? "Shortest" : "Fastest";
      const bits = [];
      if (Math.abs(deltaDistance) >= 1) bits.push(`${distance(Math.abs(deltaDistance))} ${deltaDistance < 0 ? "shorter" : "longer"}`);
      if (Math.abs(deltaTime) >= 1) bits.push(`${duration(Math.abs(deltaTime))} ${deltaTime < 0 ? "faster" : "slower"}`);
      $("alternate").hidden = false;
      const button = conditionButton(name, () => {
        document.querySelector(`input[name=objective][value="${alternate.objective}"]`).checked = true;
        planTrip();
      });
      $("alternate").append(button, document.createTextNode(` is ${bits.join(" and ")}.`));
    }
  }
  $("directions-heading").hidden = !steps.length;
  $("steps").replaceChildren();
  highlightStep([]);
  const symbols = { left: "↰", right: "↱", straight: "↑" };
  for (const step of steps) {
    const item = document.createElement("li");
    item.dataset.edges = step.edge_ids.join(" ");
    const button = document.createElement("button");
    button.type = "button";
    const icon = document.createElement("span");
    icon.className = "direction";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = symbols[step.maneuver] || (step.type === "depart" ? "●" : "◆");
    button.append(icon, document.createTextNode(step.instruction));
    if (step.length_m) {
      const length = document.createElement("small");
      length.textContent = distance(step.length_m);
      button.append(length);
    }
    const show = () => highlightStep(step.edge_ids);
    button.onclick = () => {
      show();
      if (step.edge_ids.length && window.matchMedia("(max-width: 799px)").matches) $("map-region").focus();
    };
    button.onpointerenter = show;
    button.onfocus = show;
    button.onpointerleave = () => highlightStep([]);
    button.onblur = (event) => { if (event.relatedTarget !== $("map-region")) highlightStep([]); };
    item.append(button);
    $("steps").append(item);
  }
  renderSearch();
}

function setPlanning(pending) {
  $("plan").disabled = pending;
  $("plan").textContent = pending ? "Finding route…" : "Show route";
}

function renderDeparture() {
  $("clock").hidden = $("departure").value !== "clock";
  $("traffic-note").textContent = {
    night: "Most roads are near their free-flow speed.",
    midday: "Traffic is lighter than during peak hours.",
    peak_am: "Morning traffic slows the bridge and arterials.",
    peak_pm: "Evening peak slows the bridge and arterials.",
  }[departureBand()] + (city.source ? " Estimated traffic." : "");
}

async function start() {
  $("plan").disabled = true;
  try {
    const { cities } = await api("/api/cities");
    const requested = new URLSearchParams(location.search).get("city");
    const selected = cities.find(({ id }) => id === requested) || cities[0];
    city = await api(`/api/cities/${encodeURIComponent(selected.id)}`);
    const picker = $("city-picker");
    picker.replaceChildren(...cities.map(({ id, name }) => new Option(name, id)));
    picker.value = city.id;
    picker.disabled = false;
    picker.onchange = () => {
      const url = new URL(location.pathname, location.origin);
      if (picker.value !== "sandhani-city") url.searchParams.set("city", picker.value);
      location.assign(url);
    };
    map.setAttribute("aria-label", `Street map of ${city.name}`);
    map.closest("section").setAttribute("aria-label", `${city.name} map`);
    $("map-attribution").hidden = !city.source;
    $("schematic-caption").hidden = !!city.source;
    $("pilot-note").hidden = !city.source;
    map.classList.toggle("real-map", !!city.source);
  } catch {
    setStatus("The city map could not be loaded. Reload to try again.");
    return;
  }
  initializeMap();
  resizeMap();
  restoreCamera();
  enableMap();
  for (const field of fields) bindSearch(field);
  for (const scenario of city.scenarios) {
    const button = conditionButton(PRESET_LABELS[scenario.id] || scenario.name, () => applyPreset(scenario));
    button.dataset.preset = scenario.id;
    button.setAttribute("aria-pressed", "false");
    $("presets").append(button);
  }
  renderConditions();
  renderSearch();
  renderRecents();
  $("planner").addEventListener("submit", (event) => {
    event.preventDefault();
    planTrip({ focusResult: true });
  });
  $("jump-planner").onclick = () => $("plan-heading").focus();
  $("jump-map").onclick = () => { $("fit").click(); $("map-region").focus(); };
  const examplePlaces = city.source ? ["Howrah Station", "Esplanade"] : ["Harbor Station", "North Campus"];
  $("example-trip").onclick = () => {
    fields.forEach((field, index) => setEndpoint(field, city.nodes.find((node) => node.name === examplePlaces[index]).id, false));
    planTrip({ focusResult: true });
  };
  $("swap").onclick = () => {
    const origin = endpoints.origin;
    setEndpoint("origin", endpoints.destination, false);
    setEndpoint("destination", origin);
  };
  $("clear").onclick = () => {
    requestVersion++;
    planned = false;
    setPlanning(false);
    showTrip(null);
    clearConditions();
    const current = new URL(location.href);
    current.search = city.id === "sandhani-city" ? "" : new URLSearchParams({ city: city.id }).toString();
    history.replaceState(null, "", current);
    $("restore-note").hidden = true;
    fitMap();
    saveCamera();
    setStatus(idle);
  };
  $("departure").onchange = $("clock").onchange = () => {
    renderConditions();
    renderDeparture();
    if (planned) planTrip();
  };
  $("objective").onchange = () => { if (planned) planTrip(); };
  $("clear-conditions").onclick = clearConditions;
  $("copy-link").onclick = async () => {
    writeShareUrl();
    try {
      await navigator.clipboard.writeText(location.href);
      $("copy-link").textContent = "Copied";
      setTimeout(() => { $("copy-link").textContent = "Copy link"; }, 2000);
    } catch {
      const field = document.createElement("input");
      field.readOnly = true;
      field.value = location.href;
      field.setAttribute("aria-label", "Route share link");
      $("restore-note").replaceChildren(field);
      $("restore-note").hidden = false;
      field.select();
    }
  };
  renderDeparture();
  setPlanning(false);
  applyShareUrl();
}

start();
