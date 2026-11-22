import json

import pytest

from sandhani.graph.load import load_city


def test_city_loads_and_is_connected():
    city = load_city()
    assert 50 <= len(city.nodes) <= 80
    assert 80 <= len(city.edges) <= 140
    assert sum(node.kind == "place" for node in city.nodes.values()) >= 18


@pytest.mark.parametrize("change", [{"to": "missing"}, {"length_m": 15}])
def test_reject_invalid_edge(tmp_path, change):
    document = load_city().document
    document["edges"][0].update(change)
    path = tmp_path / "city.json"
    path.write_text(json.dumps(document))
    with pytest.raises(ValueError):
        load_city(path)


def test_reject_disconnected_city(tmp_path):
    document = load_city().document
    isolated = document["nodes"][0]["id"]
    document["edges"] = [
        edge for edge in document["edges"] if isolated not in (edge["from"], edge["to"])
    ]
    document["scenarios"] = []
    path = tmp_path / "city.json"
    path.write_text(json.dumps(document))
    with pytest.raises(ValueError, match="disconnected"):
        load_city(path)


@pytest.mark.parametrize("kind", ["nodes", "edges"])
def test_reject_duplicate_ids(tmp_path, kind):
    document = load_city().document
    document[kind].append(document[kind][0])
    path = tmp_path / "city.json"
    path.write_text(json.dumps(document))
    with pytest.raises(ValueError, match="Duplicate"):
        load_city(path)
