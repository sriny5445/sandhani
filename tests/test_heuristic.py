import random

import pytest

from sandhani.graph.load import load_city
from sandhani.search.astar import astar
from sandhani.search.heuristic import (
    SearchContext, distance, length_weight, time_lower_bound, time_weight, zero,
)

CITY = load_city()
OBJECTIVES = [(length_weight, distance), (time_weight, time_lower_bound)]


@pytest.mark.parametrize("band", CITY.document["bands"])
@pytest.mark.parametrize("closures", [(), ("e-bridge-n", "e-bridge-s")])
@pytest.mark.parametrize("weight,heuristic", OBJECTIVES)
def test_city_wide_optimality(band, closures, weight, heuristic):
    context = SearchContext.for_trip(CITY, band, closures)
    for start in CITY.nodes:
        for goal in CITY.nodes:
            actual = astar(CITY.adjacency, start, goal, weight, heuristic, context)
            expected = astar(CITY.adjacency, start, goal, weight, zero, context)
            assert actual.cost == pytest.approx(expected.cost, abs=1e-6, rel=0)


def test_heuristic_admissibility():
    context = SearchContext.for_trip(CITY, "night")
    randomizer = random.Random(42)
    for _ in range(30):
        start, goal = randomizer.sample(list(CITY.nodes), 2)
        for weight, heuristic in OBJECTIVES:
            true_cost = astar(CITY.adjacency, start, goal, weight, zero, context).cost
            assert heuristic(start, goal, context) <= true_cost + 1e-6
