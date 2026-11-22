"""Convert bounded OpenStreetMap XML exports to Sandhani's directed road graph."""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from math import ceil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sandhani.graph.geo import haversine
from sandhani.graph.model import Node

BANDS = {
    "night": {"local": 1.05, "arterial": 1, "highway": .95, "bridge": 1},
    "midday": {"local": .85, "arterial": .75, "highway": .9, "bridge": .8},
    "peak_am": {"local": .7, "arterial": .5, "highway": .65, "bridge": .45},
    "peak_pm": {"local": .65, "arterial": .45, "highway": .6, "bridge": .35},
}
DEFAULT_SPEED = {
    "motorway": 70, "motorway_link": 40, "trunk": 55, "trunk_link": 35,
    "primary": 45, "primary_link": 35, "secondary": 40, "secondary_link": 30,
    "tertiary": 35, "tertiary_link": 25, "unclassified": 25,
    "residential": 25, "living_street": 15, "service": 15,
}
PLACES = {
    5808896366: ("Howrah Station", ["howrah junction", "railway station", "হাওড়া"]),
    2283710598: ("Esplanade", ["dharmatala", "metro", "ধর্মতলা"]),
    1187083591: ("Eden Gardens", ["stadium", "cricket"]),
    1189036944: ("B. B. D. Bagh", ["dalhousie", "bbd bagh"]),
    2814549255: ("New Market", ["hogg market", "shopping"]),
    11699262524: ("Howrah Maidan", ["maidan metro", "howrah"]),
    11703491166: ("Maidan", ["kolkata maidan", "maidan metro"]),
}


def tags(element):
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def read_osm(paths):
    coordinates, ways = {}, {}
    for path in paths:
        root = ET.parse(path).getroot()
        for node in root.findall("node"):
            lat, lon = (float(node.get(key)) for key in ("lat", "lon"))
            node_id = int(node.get("id"))
            coordinates[node_id] = Node(f"osm-{node_id}", "", [], lat, lon, "junction")
        for way in root.findall("way"):
            ways[int(way.get("id"))] = [int(nd.get("ref")) for nd in way.findall("nd")], tags(way)
    return coordinates, ways


def driveable(info):
    access = next((info[key] for key in ("motorcar", "motor_vehicle", "vehicle", "access") if key in info), "yes")
    return (
        info.get("highway") in DEFAULT_SPEED
        and access in {"yes", "permissive", "designated", "destination"}
        and info.get("service") not in {"driveway", "parking_aisle", "emergency_access", "drive-through"}
        and info.get("area") != "yes"
    )


def road_sections(ways, coordinates):
    for way_id, (refs, info) in sorted(ways.items()):
        if not driveable(info):
            continue
        run = []
        for ref in refs:
            if ref in coordinates:
                if not run or run[-1] != ref:
                    run.append(ref)
            else:
                if len(run) > 1:
                    yield way_id, run, info
                run = []
        if len(run) > 1:
            yield way_id, run, info


def make_edges(sections, coordinates, split):
    edges = []
    for way_id, refs, info in sections:
        road = info["highway"]
        kind = "local"
        if info.get("bridge", "no") != "no":
            kind = "bridge"
        elif road.startswith(("motorway", "trunk")):
            kind = "highway"
        elif road.startswith(("primary", "secondary", "tertiary")):
            kind = "arterial"
        name = info.get("name:en") or info.get("name") or "Unnamed road"
        if name in {"Rabindra Setu", "Rabindra Setu (Howrah Bridge)"}:
            name = "Howrah Bridge"
        speed_tag = info.get("maxspeed", "")
        limit = re.fullmatch(r"([0-9]+)(?: (km/h|mph))?", speed_tag)
        speed = DEFAULT_SPEED[road]
        if limit:
            speed = max(15, min(100, round(int(limit[1]) * (1.609344 if limit[2] == "mph" else 1))))
        one_way = info.get("oneway", "yes" if road == "motorway" or info.get("junction") == "roundabout" else "no")
        starts = [0, *(i for i in range(1, len(refs) - 1) if refs[i] in split), len(refs) - 1]
        for left, right in zip(starts, starts[1:]):
            chain = refs[left:right + 1]
            if chain[0] == chain[-1]:
                continue
            points = [coordinates[ref] for ref in chain]
            length = max(15, ceil(sum(haversine(a, b) for a, b in zip(points, points[1:]))))
            a, b = chain[0], chain[-1]
            segment = f"w{way_id}-{a}-{b}"
            directions = []
            if one_way != "-1":
                directions.append(("f", points))
            if one_way not in {"yes", "1", "true"}:
                directions.append(("r", points[::-1]))
            for suffix, direction in directions:
                edges.append({
                    "id": f"{segment}-{suffix}", "segment_id": segment,
                    "from": direction[0].id, "to": direction[-1].id, "name": name,
                    "length_m": length, "free_flow_kph": speed, "road_class": kind,
                    "one_way": len(directions) == 1,
                    "geometry": [[node.lat, node.lon] for node in direction[1:-1]],
                })
    return edges


def largest_component(edges):
    adjacent = defaultdict(set)
    for edge in edges:
        a, b = edge["from"], edge["to"]
        adjacent[a].add(b)
        adjacent[b].add(a)
    remaining = set(adjacent)
    largest = set()
    while remaining:
        root = min(remaining)
        seen, pending = {root}, [root]
        while pending:
            more = adjacent[pending.pop()] - seen
            seen.update(more)
            pending.extend(more)
        remaining.difference_update(seen)
        if len(seen) > len(largest):
            largest = seen
    return largest


def build_document(coordinates, ways, source_date):
    sections = list(road_sections(ways, coordinates))
    occurrences = Counter(ref for _, refs, _ in sections for ref in refs)
    split = {ref for ref, count in occurrences.items() if count > 1}
    split.update(ref for _, refs, _ in sections for ref in (refs[0], refs[-1]))
    # Attach each landmark to a mapped road vertex, including vertices between junctions.
    road_refs = sorted(occurrences)
    place_refs = {}
    for landmark, place in PLACES.items():
        if landmark in coordinates:
            target = coordinates[landmark]
            ref = min(road_refs, key=lambda key: haversine(target, coordinates[key]))
            place_refs[ref] = place
    split.update(place_refs)
    all_edges = make_edges(sections, coordinates, split)
    component = largest_component(all_edges)
    edges = [edge for edge in all_edges if edge["from"] in component]
    for landmark, place in PLACES.items():
        if landmark not in coordinates or any(place_refs.get(ref) == place and coordinates[ref].id in component for ref in place_refs):
            continue
        target = coordinates[landmark]
        candidates = (ref for ref in split if coordinates[ref].id in component and ref not in place_refs)
        ref = min(candidates, key=lambda key: (haversine(target, coordinates[key]), key))
        place_refs[ref] = place
    nodes = []
    for ref, node in sorted(coordinates.items()):
        if node.id not in component:
            continue
        name, aliases = place_refs.get(ref, ("Road junction", []))
        nodes.append({
            "id": node.id, "name": name, "aliases": aliases, "lat": node.lat, "lon": node.lon,
            "kind": "place" if ref in place_refs else "junction",
        })
    named_bridge = [
        edge["id"] for edge in edges if edge["name"] == "Howrah Bridge" and edge["road_class"] == "bridge"
    ]
    scenarios = [
        {"id": "clear-afternoon", "name": "Clear afternoon", "band": "midday", "closures": []},
        {"id": "evening-peak", "name": "Evening peak", "band": "peak_pm", "closures": []},
    ]
    if named_bridge:
        scenarios.append({"id": "howrah-bridge-closed", "name": "Howrah Bridge closed", "band": None, "closures": named_bridge})
    # These two connected outer ways form the Hooghly riverbank ring in OSM.
    bank_ways = [28573377, 1463404357]
    water = []
    if all(way in ways for way in bank_ways):
        first, second = (ways[way][0] for way in bank_ways)
        if first[-1] == second[0] and second[-1] == first[0]:
            ring = first + second[1:-1]
            if all(ref in coordinates for ref in ring):
                water = [[[coordinates[ref].lat, coordinates[ref].lon] for ref in ring]]
    return {
        "id": "howrah-esplanade", "name": "Howrah–Esplanade", "crs": "EPSG:4326",
        "source": {"name": "OpenStreetMap", "date": source_date, "license": "ODbL-1.0"},
        "bounds": {
            "south": min(node["lat"] for node in nodes) - .001, "west": min(node["lon"] for node in nodes) - .001,
            "north": max(node["lat"] for node in nodes) + .001, "east": max(node["lon"] for node in nodes) + .001,
        },
        "vmax_kph": 100, "bands": BANDS, "nodes": nodes, "edges": edges, "scenarios": scenarios, "water": water,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True, help="OpenStreetMap export date (YYYY-MM-DD)")
    parser.add_argument("extract", type=Path, nargs="+")
    args = parser.parse_args()
    document = build_document(*read_osm(args.extract), args.date)
    target = Path(__file__).resolve().parents[1] / "data" / "howrah_esplanade.json"
    target.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(document['nodes'])} nodes, {len(document['edges'])} directed edges")


if __name__ == "__main__":
    main()
