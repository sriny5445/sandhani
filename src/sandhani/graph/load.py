import json
from pathlib import Path

from .model import City, Edge, Node
from .validate import validate

CITY_PATH = Path(__file__).resolve().parents[3] / "data" / "sandhani_city.json"


def load_city(path: Path = CITY_PATH) -> City:
    document = json.loads(path.read_text(encoding="utf-8"))
    nodes = {row["id"]: Node(**row) for row in document["nodes"]}
    edges = {}
    for row in document["edges"]:
        fields = dict(row)
        fields["source"] = fields.pop("from")
        fields["target"] = fields.pop("to")
        edges[row["id"]] = Edge(**fields)
    validate(document, nodes, edges)
    adjacency = {node_id: [] for node_id in nodes}
    for edge in edges.values():
        adjacency[edge.source].append(edge)
    return City(document, nodes, edges, adjacency)
