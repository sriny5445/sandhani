import pytest
from fastapi.testclient import TestClient

from api.index import app

CLIENT = TestClient(app)
TRIP = {
    "city_id": "sandhani-city", "origin": "n01", "destination": "n20",
    "objective": "fastest", "band": "night",
}


def test_health_and_static_root():
    response = CLIENT.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "city": "sandhani-city"}
    assert CLIENT.get("/").status_code == 200


def test_cities():
    assert CLIENT.get("/api/cities").json()["cities"][0]["place_count"] == 20
    city = CLIENT.get("/api/cities/sandhani-city")
    assert city.status_code == 200
    assert city.json()["nodes"][0]["name"] == "Harbor Station"
    assert CLIENT.get("/api/cities/unknown").status_code == 404


def test_hand_checked_route():
    response = CLIENT.post("/api/route", json=TRIP)
    assert response.status_code == 200
    result = response.json()
    assert result["nodes"] == ["n01", "n24", "n34", "n35", "n45", "n20"]
    assert result["summary"]["distance_m"] == sum([369, 542, 391, 582, 690])
    assert result["summary"]["time_s"] == pytest.approx(
        3.6 * ((369 + 391 + 582 + 690) / 55 + 542 / 76), abs=1e-6
    )


@pytest.mark.parametrize("change,status,code", [
    ({"origin": "n99"}, 404, "unknown_node"),
    ({"city_id": "unknown"}, 404, "unknown_city"),
    ({"closures": ["unknown"]}, 404, "unknown_edge"),
    ({"band": "tomorrow"}, 422, "validation_error"),
    ({"slowdowns": [{"edge_id": "e039", "factor": 1e-307}]}, 422, "validation_error"),
    ({"slowdowns": [{"edge_id": "e001", "factor": 0}]}, 422, "validation_error"),
])
def test_typed_errors(change, status, code):
    response = CLIENT.post("/api/route", json=TRIP | change)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_no_path_and_compare():
    city = CLIENT.get("/api/cities/sandhani-city").json()
    closures = [edge["id"] for edge in city["edges"] if edge["from"] == TRIP["origin"]]
    response = CLIENT.post("/api/route", json=TRIP | {"closures": closures})
    assert response.status_code == 200
    assert response.json()["error"]["code"] == "no_path"
    comparison = CLIENT.post("/api/route/compare", json=TRIP).json()
    assert comparison["costs_match"] is True
    assert comparison["astar"]["cost"] == pytest.approx(comparison["dijkstra"]["cost"], abs=1e-6)


def test_howrah_map_and_bridge_detour():
    cities = CLIENT.get("/api/cities").json()["cities"]
    assert {city["id"] for city in cities} == {"sandhani-city", "howrah-esplanade"}
    response = CLIENT.get("/api/cities/howrah-esplanade")
    assert response.status_code == 200
    city = response.json()
    assert city["source"]["license"] == "ODbL-1.0"
    assert city["water"]
    places = {node["name"]: node["id"] for node in city["nodes"] if node["kind"] == "place"}
    body = TRIP | {"city_id": city["id"], "origin": places["Howrah Station"],
                   "destination": places["Esplanade"], "band": "midday"}
    open_route = CLIENT.post("/api/route", json=body).json()
    by_id = {edge["id"]: edge for edge in city["edges"]}
    assert any(by_id[edge["id"]]["geometry"] for edge in open_route["edges"])
    assert any(edge["name"] == "Howrah Bridge" for edge in open_route["edges"])
    scenario = next(s for s in city["scenarios"] if s["id"] == "howrah-bridge-closed")
    request = body | {"closures": scenario["closures"]}
    detour = CLIENT.post("/api/route", json=request).json()
    assert not ({edge["id"] for edge in detour["edges"]} & set(scenario["closures"]))
    assert detour["summary"]["distance_m"] > open_route["summary"]["distance_m"]
    assert "Vidyasagar Flyover" in detour["reason"]
    assert CLIENT.post("/api/route/compare", json=request).json()["costs_match"]
