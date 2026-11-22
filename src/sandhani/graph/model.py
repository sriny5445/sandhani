from dataclasses import dataclass


@dataclass(frozen=True)
class Node:
    id: str
    name: str
    aliases: list[str]
    lat: float
    lon: float
    kind: str


@dataclass(frozen=True)
class Edge:
    id: str
    source: str
    target: str
    name: str
    length_m: int
    free_flow_kph: float
    road_class: str
    one_way: bool
    geometry: list[list[float]] | None = None
    segment_id: str | None = None


@dataclass(frozen=True)
class City:
    document: dict
    nodes: dict[str, Node]
    edges: dict[str, Edge]
    adjacency: dict[str, list[Edge]]
