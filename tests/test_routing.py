import pytest

from sandhani.graph.load import load_city
from sandhani.routing.service import compare, route
from sandhani.routing.steps import build_steps

CITY = load_city()


def test_band_changes_fastest_crossing():
    night = route(CITY, "n27", "n34", "fastest", "night")
    peak = route(CITY, "n27", "n34", "fastest", "peak_pm")
    assert night["nodes"] == ["n27", "n26", "n25", "n24", "n34"]
    assert peak["nodes"] == ["n27", "n37", "n36", "n35", "n34"]
    assert peak["summary"]["time_s"] > night["summary"]["time_s"]
    assert peak["alternate_objective"]["objective"] == "shortest"


def test_shortest_geometry_same_and_slowdown_changes_time():
    def shortest(band, slowdowns=None):
        return route(CITY, "n01", "n20", "shortest", band, slowdowns=slowdowns)

    night = shortest("night")
    peak = shortest("peak_pm")
    edge = peak["edges"][0]
    slow = shortest("peak_pm", {edge["id"]: 0.4})
    assert night["nodes"] == peak["nodes"] == slow["nodes"]
    assert slow["edges"][0]["time_s"] == pytest.approx(edge["time_s"] / 0.4)
    assert slow["summary"]["time_s"] > peak["summary"]["time_s"]


def test_steps_group_roads_and_derive_turns():
    result = route(CITY, "n01", "n20", "fastest", "night")
    edges = [CITY.edges[edge["id"]] for edge in result["edges"]]
    steps = build_steps(CITY, "n01", "n20", edges, lambda edge: edge.length_m / 10)
    assert steps[0]["instruction"] == "Start at Harbor Station"
    assert steps[-1]["instruction"] == "Arrive at North Campus"
    assert [edge_id for step in steps for edge_id in step["edge_ids"]] == [edge.id for edge in edges]
    campus = next(step for step in steps if step.get("road_name") == "Campus Drive")
    assert len(campus["edge_ids"]) == 2
    assert campus["maneuver"] == "left"
    assert campus["time_s"] == pytest.approx(campus["length_m"] / 10)


def test_same_place_and_no_path():
    result = route(CITY, "n01", "n01", "fastest", "night")
    assert result["nodes"] == ["n01"]
    assert result["edges"] == result["steps"] == []
    assert result["summary"]["time_s"] == result["summary"]["distance_m"] == 0
    closures = [edge.id for edge in CITY.adjacency["n01"]]
    assert route(CITY, "n01", "n20", "fastest", "night", closures)["error"]["code"] == "no_path"


def test_bridge_reason_and_comparison():
    closures = ("e-bridge-n", "e-bridge-s")
    result = route(CITY, "n01", "n20", "fastest", "peak_pm", closures)
    assert result["reason"] == "Harbor Bridge is closed, so this crosses at Mill Causeway."
    algorithms = compare(CITY, "n01", "n20", "fastest", "peak_pm", closures)
    assert algorithms["costs_match"]
    assert algorithms["astar"]["nodes_expanded"] <= algorithms["dijkstra"]["nodes_expanded"]
