"""Lower bounds for distance and time.

Each road is at least as long as its endpoints' great-circle distance.
The triangle inequality therefore makes direct distance consistent and
admissible. Dividing by the maximum attainable speed preserves consistency:
every road takes at least its direct distance divided by that speed.
The zero heuristic is consistent and admissible for nonnegative weights.
"""

from dataclasses import dataclass
from math import inf

from sandhani.graph.geo import haversine
from sandhani.graph.model import City, Edge


@dataclass(frozen=True)
class SearchContext:
    city: City
    speeds_mps: dict[str, float]
    vmax_mps: float

    @classmethod
    def for_trip(cls, city, band, closures=(), slowdowns=None):
        factors = city.document["bands"][band]
        slowdowns = slowdowns or {}
        closed = set(closures)
        speeds = {
            edge.id: edge.free_flow_kph * factors[edge.road_class] * slowdowns.get(edge.id, 1) / 3.6
            for edge in city.edges.values()
            if edge.id not in closed
        }
        return cls(city, speeds, max(speeds.values(), default=1.0))

    def time(self, edge: Edge) -> float:
        speed = self.speeds_mps.get(edge.id)
        return edge.length_m / speed if speed else inf


def distance(node, goal, context):
    return haversine(context.city.nodes[node], context.city.nodes[goal])


def time_lower_bound(node, goal, context):
    return distance(node, goal, context) / context.vmax_mps


def zero(node, goal, context):
    return 0.0


def length_weight(edge, context):
    return float(edge.length_m) if edge.id in context.speeds_mps else inf


def time_weight(edge, context):
    return context.time(edge)
