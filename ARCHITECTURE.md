# Architecture — LILA BLACK Player Journey Visualizer

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Backend** | Python + FastAPI | Native parquet support (PyArrow), fast async API, automatic OpenAPI docs. Data stays server-side — the browser never touches raw files. |
| **Frontend** | React 18 + Vite | Component-based UI, fast HMR during dev, optimized production build. Vite is zero-config and produces tiny bundles. |
| **Rendering** | HTML5 Canvas | Renders thousands of path points + heatmap cells per frame without DOM overhead. Significantly faster than SVG for this data density. |
| **Hosting** | Vercel (frontend) + Render (backend) | Vercel has zero-config Vite deploys. Render supports Python with persistent disk for the parquet files. Both have free tiers. |

## Data Flow

```
Raw Parquet Files (1,243 files, ~8 MB on disk)
        │
        ▼
  FastAPI Backend (loads once, cached in memory via @lru_cache)
        │
        ├── /api/matches       → match list with player counts, filters
        ├── /api/paths/{id}    → per-player movement paths (pixel coords)
        ├── /api/events/{id}   → combat/loot/storm events (pixel coords)
        ├── /api/heatmap/{map} → 32×32 intensity grid for any layer
        └── /api/stats         → global dataset stats
        │
        ▼
  React Frontend (fetches per-match data on demand)
        │
        ├── Sidebar:   map / date / match filters
        ├── Canvas:    minimap → heatmap → paths → events (layered draw)
        ├── Controls:  timeline slider, play/pause, speed
        └── Overlays:  legend, match info, player list
        │
        ▼
  Level Designer's browser
```

## Coordinate Mapping

The core challenge: converting 3D world coordinates to 2D minimap pixels.

```
u = (world_x - origin_x) / scale        →   0 to 1 (horizontal)
v = (world_z - origin_z) / scale        →   0 to 1 (vertical)

pixel_x = u × 1024
pixel_y = (1 - v) × 1024                ←   Y-flip: image origin = top-left
```

This mapping is done **server-side** when data loads. The API returns pixel coordinates directly, so the frontend never handles world-space math. The `y` column (vertical elevation) is ignored for 2D minimap plotting.

| Map | Scale | Origin X | Origin Z |
|-----|-------|----------|----------|
| AmbroseValley | 900 | -370 | -473 |
| GrandRift | 581 | -290 | -290 |
| Lockdown | 1000 | -500 | -500 |

## Assumptions

| Ambiguity | Decision |
|-----------|----------|
| **Timestamps** | `ts` values are epoch-based ms that increment ~5ms per game tick. Normalized to 0–1 per match for timeline playback. |
| **Bot detection** | UUID user_id = human, numeric = bot. Cross-validated with event types (Position vs BotPosition). |
| **Match grouping** | Files sharing the same `match_id` belong to one match. Combined and sorted by `ts` to reconstruct full timeline. |
| **Feb 14** | Partial day (79 files). Included without imputation. |
| **Match filtering** | Default API shows matches with ≥2 players. Single-player journeys are included in heatmap aggregation but not in the match list. |

## Trade-offs

| Decision | Chose | Gave up | Why |
|----------|-------|---------|-----|
| Separate backend vs embedded data | FastAPI server | Single-file simplicity | Proper separation of concerns. Data pipeline stays in Python where parquet handling is native. Frontend stays light. Scales to larger datasets without bloating the bundle. |
| Server-side coord mapping | Pre-computed pixels in API | Client-side flexibility | Keeps frontend logic minimal. Canvas just plots integers — no floating-point math per frame. |
| Canvas vs WebGL | Canvas 2D | GPU acceleration | Sufficient for ~1K points/frame. WebGL adds shader complexity for no visible gain at this data volume. |
| On-demand match loading | Fetch per match | Instant switching | Keeps initial load fast (<100ms). A match payload is ~5–20 KB, loads in <50ms on any connection. |
| 32×32 heatmap grid | Fixed resolution | Fine-grained density | Tiny JSON payload (~2 KB). Renders instantly. Higher resolution would need WebGL or pre-rendered tiles. |

## What I'd Do With More Time

1. **WebSocket live data streaming** — push new match data without page refresh
2. **Deck.gl / WebGL rendering** — GPU-accelerated layers for full 89K dataset with dynamic filtering
3. **Match replay interpolation** — smooth frame-by-frame playback between sampled positions
4. **Cross-match analytics** — K/D ratios per zone, extraction success rates, player funnels
5. **Collaborative annotations** — let designers pin notes to map locations
6. **Database backend** — DuckDB or PostgreSQL instead of in-memory pandas for larger datasets
