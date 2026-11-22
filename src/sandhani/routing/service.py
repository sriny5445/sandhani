from math import isclose

from sandhani.search.astar import astar
from sandhani.search.heuristic import (
    SearchContext, distance, length_weight, time_lower_bound, time_weight, zero,
)

from .reasons import build_reason
from .steps import build_steps

OBJECTIVES = {"shortest": (length_weight, distance), "fastest": (time_weight, time_lower_bound)}


def no_path():
    return {"error": {"code": "no_path", "message": "No road connects these places with the current closures."}}


def route(city, origin, destination, objective, band, closures=(), slowdowns=None):
    context = SearchContext.for_trip(city, band, closures, slowdowns)
    weight, heuristic = OBJECTIVES[objective]
    result = astar(city.adjacency, origin, destination, weight, heuristic, context)
    if result is None:
        return no_path()

    edges = result.edges
    meters = sum(edge.length_m for edge in edges)
    seconds = sum(map(context.time, edges))
    free_time = sum(edge.length_m * 3.6 / edge.free_flow_kph for edge in edges)
    steps = build_steps(city, origin, destination, edges, context.time)
    drives = steps[1:-1]
    if drives:
        via = max(drives[1:] or drives, key=lambda step: step["length_m"])["road_name"]
    else:
        via = None

    response = {
        "algorithm": "astar",
        "objective": objective,
        "band": band,
        "origin": {"id": origin, "name": city.nodes[origin].name},
        "destination": {"id": destination, "name": city.nodes[destination].name},
        "nodes": result.nodes,
        "edges": [
            {
                "id": edge.id, "name": edge.name, "from": edge.source, "to": edge.target,
                "length_m": edge.length_m, "time_s": context.time(edge), "road_class": edge.road_class,
            }
            for edge in edges
        ],
        "steps": steps,
        "summary": {
            "distance_m": meters, "time_s": seconds, "free_flow_time_s": free_time,
            "delay_s": seconds - free_time, "nodes_expanded": result.nodes_expanded, "via": via,
        },
        "reason": build_reason(edges, closures, via, objective, city.document["scenarios"]),
    }
    alternate = "shortest" if objective == "fastest" else "fastest"
    alt_weight, alt_heuristic = OBJECTIVES[alternate]
    other = astar(city.adjacency, origin, destination, alt_weight, alt_heuristic, context)
    if other is not None:
        response["alternate_objective"] = {
            "objective": alternate,
            "distance_m": sum(edge.length_m for edge in other.edges),
            "time_s": sum(map(context.time, other.edges)),
            "same_path": other.edges == edges,
        }
    return response


def compare(city, origin, destination, objective, band, closures=(), slowdowns=None):
    context = SearchContext.for_trip(city, band, closures, slowdowns)
    weight, heuristic = OBJECTIVES[objective]
    actual = astar(city.adjacency, origin, destination, weight, heuristic, context)
    if actual is None:
        return no_path()
    baseline = astar(city.adjacency, origin, destination, weight, zero, context)
    return {
        "astar": search_stats(actual),
        "dijkstra": search_stats(baseline),
        "costs_match": isclose(actual.cost, baseline.cost, abs_tol=1e-6, rel_tol=0),
    }


def search_stats(result):
    return {"cost": result.cost, "nodes_expanded": result.nodes_expanded, "nodes": result.nodes}
