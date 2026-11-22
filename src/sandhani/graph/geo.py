from math import asin, atan2, cos, degrees, radians, sin, sqrt

from .model import Node

EARTH_RADIUS_M = 6_371_000


def haversine(a: Node, b: Node) -> float:
    lat_a, lat_b = radians(a.lat), radians(b.lat)
    dlon = radians(b.lon - a.lon)
    chord = sin((lat_b - lat_a) / 2) ** 2 + cos(lat_a) * cos(lat_b) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(min(1, chord)))


def project(node: Node, origin: Node) -> tuple[float, float]:
    return (
        EARTH_RADIUS_M * radians(node.lon - origin.lon) * cos(radians(origin.lat)),
        EARTH_RADIUS_M * radians(node.lat - origin.lat),
    )


def turn_angle(a: Node, junction: Node, b: Node) -> float:
    ax, ay = project(a, junction)
    bx, by = project(b, junction)
    return degrees(atan2(ay * bx - ax * by, -ax * bx - ay * by))
