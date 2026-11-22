# Sandhani

Sandhani plans trips across the fictional Sandhani City and a real-road pilot in Kolkata and Howrah. Choose the shortest route or the fastest route under the selected departure band. The map displays the route and driving directions, and you can close or slow roads to see how the route changes.

The Python engine uses handwritten A* on a directed graph. Dijkstra uses the same search with a zero heuristic. The binary-heap implementation runs in O(E log V) time on the city graph.

## Run locally

From the repository root, use Python 3.12.

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn api.index:app --reload --port 8000
```

Open [the trip planner](http://127.0.0.1:8000/).

## Test

```sh
python -m pytest -q
python scripts/check_city.py
```

## Hand-checked route

Harbor Station to North Campus, fastest at night.

```sh
curl -fsS http://127.0.0.1:8000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"city_id":"sandhani-city","origin":"n01","destination":"n20","objective":"fastest","band":"night"}'
```

The node sequence is `n01 → n24 → n34 → n35 → n45 → n20`, covering 2,574 m in approximately 158.677 s. The distance is the sum of 369, 542, 391, 582, and 690 m. The bridge segment runs at 76 km/h and the other four at 55 km/h in the night band, giving `3.6 × (542 / 76 + 2032 / 55)` seconds.

## Howrah–Esplanade pilot

Choose **Howrah–Esplanade** from the map's city selector. At midday, the fastest route from Howrah Station to Esplanade is 4,435 m via Howrah Bridge. The **Howrah Bridge closed** preset sends the trip via Vidyasagar Flyover (11,890 m). The map draws the stored road curves and Hooghly riverbank. Share links include the city.

The pilot uses a bounded OpenStreetMap snapshot from 22 November 2026, with seven searchable landmarks snapped to nearby mapped road access. Travel times use tagged or estimated road speeds and modeled departure bands. The pilot handles mapped one-ways and basic vehicle access. It is a planning demo with partial geographic coverage and no live traffic or turn-restriction relations.

The bundled [Howrah–Esplanade data](data/howrah_esplanade.json) is derived from © OpenStreetMap contributors and distributed under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright).

To regenerate the pilot, use XML map exports for the three source bounding boxes (west, south, east, north) and a full export of way `1463404357` for the riverbank ring.

| Extract | Bounding box |
| --- | --- |
| Central | `88.329,22.556,88.357,22.587` |
| South | `88.315,22.536,88.357,22.559` |
| West | `88.312,22.555,88.331,22.587` |

```sh
python scripts/import_kolkata.py --date YYYY-MM-DD central.osm south.osm west.osm riverbank.osm
```

## Deploy to Vercel

From the repository root, run `vercel` with the authenticated Vercel CLI to create a preview. The Python runtime defaults to 3.12. Both city datasets ship with the deployment and the app requires no environment variables.

- Locally, Uvicorn serves `api.index:app` with a FastAPI router prefixed by `/api`.
- Vercel dispatches `/api/*` to `api/index.py` through the first route in `vercel.json`.
- The function routes the original request path using the same FastAPI prefix.
- Vercel serves the UI and its assets from `public/`; Uvicorn serves them through the static mount.

Check the preview's `GET /api/health` for HTTP 200 and repeat the hand-checked route with the preview URL. Once the preview passes, use `vercel --prod` to promote it.
