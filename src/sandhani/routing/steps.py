from dataclasses import replace
from itertools import groupby

from sandhani.graph.geo import turn_angle


def road_group(edge):
    if edge.name == "Unnamed road" and edge.segment_id:
        return edge.name, edge.segment_id.split("-", 1)[0]
    return edge.name, None


def build_steps(city, origin, destination, edges, time_for_edge):
    if not edges:
        return []
    steps = [endpoint_step("depart", f"Start at {city.nodes[origin].name}")]
    previous = None
    for (name, _), group in groupby(edges, key=road_group):
        segment = list(group)
        first = segment[0]
        maneuver = "straight"
        if previous:
            a, junction, b = (city.nodes[node] for node in (previous.source, first.source, first.target))
            if previous.geometry:
                lat, lon = previous.geometry[-1]
                a = replace(a, lat=lat, lon=lon)
            if first.geometry:
                lat, lon = first.geometry[0]
                b = replace(b, lat=lat, lon=lon)
            angle = turn_angle(a, junction, b)
            if abs(angle) >= 30:
                maneuver = "left" if angle > 0 else "right"
        instruction = f"Continue on {name}" if maneuver == "straight" else f"Turn {maneuver} onto {name}"
        steps.append({
            "type": "continue" if maneuver == "straight" else "turn",
            "instruction": instruction,
            "maneuver": maneuver,
            "road_name": name,
            "edge_ids": [edge.id for edge in segment],
            "length_m": sum(edge.length_m for edge in segment),
            "time_s": sum(time_for_edge(edge) for edge in segment),
        })
        previous = segment[-1]
    steps.append(endpoint_step("arrive", f"Arrive at {city.nodes[destination].name}"))
    return steps


def endpoint_step(kind, instruction):
    return {"type": kind, "instruction": instruction, "edge_ids": [], "length_m": 0, "time_s": 0}
