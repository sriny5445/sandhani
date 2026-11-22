
import pytest

from sandhani.graph.load import load_city
from sandhani.graph.model import Edge
from sandhani.search.astar import astar
from sandhani.search.heuristic import SearchContext, distance, length_weight, time_weight, zero


@pytest.mark.parametrize(
    "by_time,nodes,cost",
    [(False, ["a", "b", "f"], 100), (True, ["a", "c", "d", "f"], 7.2)],
)
def test_hand_checked_fixture(by_time, nodes, cost):
    adjacency = {node: [] for node in "abcdef"}
    for a, b, meters, kph in [
        ("a", "b", 50, 20), ("b", "f", 50, 20),
        ("a", "c", 60, 90), ("c", "d", 60, 90), ("d", "f", 60, 90),
        ("a", "e", 180, 30), ("e", "f", 180, 30),
    ]:
        adjacency[a].append(Edge(a+b, a, b, a+b, meters, kph, "local", True))

    def weight(edge, _):
        return edge.length_m * 3.6 / edge.free_flow_kph if by_time else edge.length_m

    def heuristic(node, goal, _):
        return 0 if node == goal else 1

    result = astar(adjacency, "a", "f", weight, heuristic)
    baseline = astar(adjacency, "a", "f", weight, zero)
    assert result.nodes == baseline.nodes == nodes
    assert result.cost == pytest.approx(cost, abs=1e-6)
    assert baseline.cost == pytest.approx(cost, abs=1e-6)
    assert astar(adjacency, "f", "a", weight, heuristic) is None


def test_closure_and_stability():
    city = load_city()
    open_context = SearchContext.for_trip(city, "night")
    closed_context = SearchContext.for_trip(city, "night", ("e-bridge-n", "e-bridge-s"))
    normal = astar(city.adjacency, "n01", "n20", length_weight, distance, open_context)
    repeat = astar(city.adjacency, "n01", "n20", length_weight, distance, open_context)
    detour = astar(city.adjacency, "n01", "n20", length_weight, distance, closed_context)
    assert normal.nodes == repeat.nodes
    assert "e-bridge-n" in {edge.id for edge in normal.edges}
    assert {edge.id for edge in detour.edges}.isdisjoint({"e-bridge-n", "e-bridge-s"})
    assert detour.cost - normal.cost > 600


def test_city_one_way_edges():
    city = load_city()
    context = SearchContext.for_trip(city, "night")
    for edge in city.edges.values():
        if edge.one_way:
            assert all(reverse.target != edge.source for reverse in city.adjacency[edge.target])
            result = astar(city.adjacency, edge.target, edge.source, time_weight, zero, context)
            assert all(step.id != edge.id for step in result.edges)
