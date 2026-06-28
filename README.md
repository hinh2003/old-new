# Convert New Administrative Address to Old Administrative Address

Node.js full-stack app for converting a Vietnamese address from the post-merge administrative system to the pre-merge system using geographic coordinates.

## Flow

The app supports one mode:

1. New -> Old

Flow:

1. User enters a current address in the frontend.
2. Backend geocodes it with Photon.
3. Backend performs point-in-polygon against the old boundary GeoJSON.
4. The matched old ward, district, and province are merged back into the address.

## Run

```bash
npm install
npm start
```

Open the app at `http://localhost:3000`.

Create a `.env` file before running:

```bash
PHOTON_BASE_URL=https://photon.komoot.io
```

## API

### `POST /convert-address`

Request:

```json
{
  "formatted_address": "FPT University, Hoa Lac Hi-Tech Park, Km29 Thang Long Boulevard, Hoa Lac Commune, Hanoi"
}
```

Optional coordinates are still accepted if the frontend already has them:

```json
{
  "formatted_address": "FPT University, Hoa Lac Hi-Tech Park, Km29 Thang Long Boulevard, Hoa Lac Commune, Hanoi",
  "latitude": 21.013245,
  "longitude": 105.527913
}
```

Success response:

```json
{
  "success": true,
  "original_address": "FPT University, Hoa Lac Hi-Tech Park, Km29 Thang Long Boulevard, Hoa Lac Commune, Hanoi",
  "converted_address": "FPT University, Hoa Lac Hi-Tech Park, Km29 Thang Long Boulevard, Thach Hoa Commune, Thach That District, Hanoi",
  "old_address": "FPT University, Hoa Lac Hi-Tech Park, Km29 Thang Long Boulevard, Thach Hoa Commune, Thach That District, Hanoi",
  "old_administrative": {
    "province": "Hanoi",
    "district": "Thach That District",
    "ward": "Thach Hoa Commune"
  },
  "converted_administrative": {
    "province": "Hanoi",
    "district": "Thach That District",
    "ward": "Thach Hoa Commune"
  },
  "input_coordinates": {
    "latitude": 21.013245,
    "longitude": 105.527913
  },
  "geocoded_coordinates": {
    "latitude": 21.013245,
    "longitude": 105.527913,
    "provider": "photon",
    "display_name": "...",
    "query": "..."
  },
  "matched_feature": {
    "feature_id": "12345",
    "province": "Hanoi",
    "district": "Thach That District",
    "ward": "Thach Hoa Commune"
  }
}
```

Failure response:

```json
{
  "success": false,
  "message": "Coordinate is outside all old administrative boundaries."
}
```

## Frontend

The UI is served from the same Express app:

- address input
- conversion result panel

## How the lookup works

1. Load `truocsapnhap.geojson` once at startup.
2. Precompute a bounding box for each feature.
3. Build an in-memory spatial grid index.
4. For each request, look up only candidate polygons near the point.
5. Run exact point-in-polygon checks on those candidates.
6. Return the first matching feature in file order.

## Notes on performance

- The current skeleton uses a uniform spatial grid plus bounding-box filtering.
- This is fast enough for a first version and keeps the code simple.
- For larger scale or higher query throughput, replace or augment the grid with an R-tree such as `rbush`.
- The GeoJSON file is loaded only once when the server starts.

## Boundary behavior

- `Polygon` and `MultiPolygon` are both supported.
- Points on the polygon edge are treated as inside.
- If multiple polygons contain the same point, the first feature in file order wins.

## Config

- `PORT`: server port, default `3000`
- `OLD_BOUNDARIES_PATH`: path to the old boundary GeoJSON file
- `GRID_SIZE`: spatial grid size in degrees, default `0.1`
- `PHOTON_BASE_URL`: Photon fallback base URL
- The app currently uses Photon only for geocoding
