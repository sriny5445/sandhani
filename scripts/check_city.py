import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sandhani.graph.load import load_city

city = load_city()
places = sum(node.kind == "place" for node in city.nodes.values())
print(f"{len(city.nodes)} nodes, {len(city.edges)} directed edges, {places} places: ok")
