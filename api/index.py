import sys
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from sandhani.api.schemas import RouteRequest
from sandhani.graph.load import load_city
from sandhani.routing.service import compare, route

app = FastAPI(title="Sandhani", docs_url=None, redoc_url=None, openapi_url=None)
router = APIRouter(prefix="/api")
default_city = load_city()
city_id = default_city.document["id"]
pilot = load_city(ROOT / "data" / "howrah_esplanade.json")
city_registry = {city_id: default_city, pilot.document["id"]: pilot}


def error(code, message, status=404):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


@app.exception_handler(RequestValidationError)
async def bad_request(request, exc):
    issue = exc.errors()[0]
    field = ".".join(str(part) for part in issue["loc"] if part != "body")
    return error("validation_error", f"Invalid {field or 'request body'}. {issue['msg']}", 422)


@router.get("/health")
def health():
    return {"status": "ok", "city": city_id}


@router.get("/cities")
def cities():
    return {"cities": [
        {"id": city.document["id"], "name": city.document["name"],
         "place_count": sum(node.kind == "place" for node in city.nodes.values())}
        for city in city_registry.values()
    ]}


@router.get("/cities/{requested_city}")
def city_detail(requested_city: str):
    city = city_registry.get(requested_city)
    if city is None:
        return error("unknown_city", f"Unknown city '{requested_city}'.")
    return city.document


def handle_trip(request, operation):
    city = city_registry.get(request.city_id)
    if city is None:
        return error("unknown_city", f"Unknown city '{request.city_id}'.")
    for field in ("origin", "destination"):
        node = getattr(request, field)
        if node not in city.nodes:
            return error("unknown_node", f"Unknown {field} '{node}'.")
    slowdowns = {entry.edge_id: entry.factor for entry in request.slowdowns}
    for edge_id in (*request.closures, *slowdowns):
        if edge_id not in city.edges:
            return error("unknown_edge", f"Unknown edge '{edge_id}'.")
    return operation(city, request.origin, request.destination, request.objective,
                     request.band, request.closures, slowdowns)


@router.post("/route")
def plan_route(request: RouteRequest):
    return handle_trip(request, route)


@router.post("/route/compare")
def compare_routes(request: RouteRequest):
    return handle_trip(request, compare)


app.include_router(router)
app.mount("/", StaticFiles(directory=ROOT / "public", html=True), name="public")
