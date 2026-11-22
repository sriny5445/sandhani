from math import isfinite

from .geo import haversine

ROAD_CLASSES = {"local", "arterial", "highway", "bridge"}
BANDS = {"night", "midday", "peak_am", "peak_pm"}


def validate(document, nodes, edges):
    if len(nodes) != len(document["nodes"]) or len(edges) != len(document["edges"]):
        raise ValueError("Duplicate node or edge id")
    if not nodes:
        raise ValueError("City has no nodes")

    neighbors = {node_id: set() for node_id in nodes}
    for edge in edges.values():
        if edge.source not in nodes or edge.target not in nodes:
            raise ValueError(f"Unknown endpoint on {edge.id}")
        direct = haversine(nodes[edge.source], nodes[edge.target])
        if type(edge.length_m) is not int or edge.length_m < 15 or edge.length_m < direct:
            raise ValueError(f"Edge {edge.id} is shorter than its minimum length")
        if not 15 <= edge.free_flow_kph <= document["vmax_kph"] or not isfinite(edge.free_flow_kph):
            raise ValueError(f"Invalid speed on {edge.id}")
        if edge.road_class not in ROAD_CLASSES:
            raise ValueError(f"Unknown road class on {edge.id}")
        neighbors[edge.source].add(edge.target)
        neighbors[edge.target].add(edge.source)

    if set(document["bands"]) != BANDS:
        raise ValueError("City must define all departure bands")
    for band, factors in document["bands"].items():
        if set(factors) != ROAD_CLASSES or any(not 0 < factor <= 1.2 for factor in factors.values()):
            raise ValueError(f"Invalid multipliers for {band}")

    pending = [next(iter(nodes))]
    visited = set(pending)
    while pending:
        adjacent = neighbors[pending.pop()] - visited
        visited.update(adjacent)
        pending.extend(adjacent)
    if len(visited) != len(nodes):
        raise ValueError("City graph is disconnected")

    for scenario in document["scenarios"]:
        if not set(scenario["closures"]) <= edges.keys():
            raise ValueError(f"Unknown edge in scenario {scenario['id']}")
