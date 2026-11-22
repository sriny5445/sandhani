"""Deterministic shortest-path search with a binary heap."""

from dataclasses import dataclass
from heapq import heappop, heappush
from itertools import count
from math import inf

from sandhani.graph.model import Edge


@dataclass(frozen=True)
class SearchResult:
    nodes: list[str]
    edges: list[Edge]
    cost: float
    nodes_expanded: int


def astar(adjacency, start, goal, weight, heuristic, context=None):
    """Return the optimal path, or None if the goal is unreachable."""
    sequence = count()
    first = next(sequence)
    initial_h = heuristic(start, goal, context)
    queue = [(initial_h, initial_h, start, first)]
    best = {start: 0.0}
    active = {start: first}
    parents = {}
    expanded = 0

    while queue:
        _, _, node, entry = heappop(queue)
        if active[node] != entry:
            continue
        expanded += 1
        if node == goal:
            edges = []
            while node != start:
                edge = parents[node]
                edges.append(edge)
                node = edge.source
            edges.reverse()
            return SearchResult([start, *(edge.target for edge in edges)], edges, best[goal], expanded)

        for edge in adjacency[node]:
            cost = weight(edge, context)
            if cost == inf:
                continue
            candidate = best[node] + cost
            if candidate >= best.get(edge.target, inf):
                continue
            best[edge.target] = candidate
            parents[edge.target] = edge
            h = heuristic(edge.target, goal, context)
            entry = next(sequence)
            active[edge.target] = entry
            heappush(queue, (candidate + h, h, edge.target, entry))
    return None
