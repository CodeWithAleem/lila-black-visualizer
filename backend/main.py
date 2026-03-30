"""
LILA BLACK — Player Journey Visualizer API
FastAPI backend that loads parquet telemetry data and serves it to the frontend.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import pyarrow.parquet as pq
import pandas as pd
import numpy as np
import os
import re
import json
from functools import lru_cache
from typing import Optional


class NumpyEncoder(json.JSONEncoder):
    """Handle numpy types in JSON serialization."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)): return int(obj)
        if isinstance(obj, (np.floating,)): return float(obj)
        if isinstance(obj, (np.bool_,)): return bool(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        return super().default(obj)


def numpy_safe(obj):
    """Recursively convert numpy types to native Python types."""
    if isinstance(obj, dict):
        return {k: numpy_safe(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [numpy_safe(i) for i in obj]
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        return float(obj)
    elif isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj

app = FastAPI(title="LILA BLACK Visualizer API", version="1.0.0")

# CORS — allow frontend dev server and deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ CONFIGURATION ============

MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

DATA_DIR = os.environ.get("DATA_DIR", "./player_data")
HEATMAP_GRID = 32  # 32x32 heatmap resolution


# ============ DATA LOADING ============

def is_bot(user_id: str) -> bool:
    """UUID format = human, short numeric = bot."""
    return not bool(re.match(r"^[0-9a-f]{8}-", str(user_id)))


def world_to_pixel(x: float, z: float, map_id: str, size: int = 1024) -> tuple:
    """Convert world (x, z) to minimap pixel coordinates."""
    cfg = MAP_CONFIG[map_id]
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    px = u * size
    py = (1 - v) * size
    return round(px, 1), round(py, 1)


@lru_cache(maxsize=1)
def load_all_data() -> pd.DataFrame:
    """Load all parquet files into a single DataFrame. Cached after first call."""
    print("Loading telemetry data...")
    day_map = {
        "February_10": "2026-02-10",
        "February_11": "2026-02-11",
        "February_12": "2026-02-12",
        "February_13": "2026-02-13",
        "February_14": "2026-02-14",
    }

    frames = []
    for day_folder, date_str in day_map.items():
        day_path = os.path.join(DATA_DIR, day_folder)
        if not os.path.isdir(day_path):
            continue
        for fname in os.listdir(day_path):
            fpath = os.path.join(day_path, fname)
            try:
                table = pq.read_table(fpath)
                df = table.to_pandas()
                df["date"] = date_str
                frames.append(df)
            except Exception:
                continue

    if not frames:
        raise RuntimeError(f"No data found in {DATA_DIR}")

    df = pd.concat(frames, ignore_index=True)

    # Decode event bytes → string
    df["event"] = df["event"].apply(
        lambda x: x.decode("utf-8") if isinstance(x, bytes) else str(x)
    )

    # Add computed columns
    df["is_bot"] = df["user_id"].apply(is_bot)
    df["ts_ms"] = df["ts"].astype("int64")  # milliseconds from epoch

    # Pre-compute pixel coordinates
    pixels = df.apply(
        lambda r: world_to_pixel(r["x"], r["z"], r["map_id"]), axis=1
    )
    df["px"] = [p[0] for p in pixels]
    df["py"] = [p[1] for p in pixels]

    print(f"Loaded {len(df):,} events from {df['match_id'].nunique()} matches")
    return df


# ============ API ENDPOINTS ============

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/matches")
def get_matches(
    map_id: Optional[str] = None,
    date: Optional[str] = None,
    min_players: int = 1,
):
    """List all matches with summary stats. Filterable by map, date, min players."""
    df = load_all_data()

    match_agg = df.groupby("match_id").agg(
        map_id=("map_id", "first"),
        date=("date", "first"),
        total_players=("user_id", "nunique"),
        total_events=("event", "count"),
    ).reset_index()

    # Human / bot counts
    human_counts = (
        df[~df["is_bot"]]
        .groupby("match_id")["user_id"]
        .nunique()
        .reset_index()
        .rename(columns={"user_id": "humans"})
    )
    bot_counts = (
        df[df["is_bot"]]
        .groupby("match_id")["user_id"]
        .nunique()
        .reset_index()
        .rename(columns={"user_id": "bots"})
    )

    match_agg = match_agg.merge(human_counts, on="match_id", how="left").fillna(0)
    match_agg = match_agg.merge(bot_counts, on="match_id", how="left").fillna(0)
    match_agg["humans"] = match_agg["humans"].astype(int)
    match_agg["bots"] = match_agg["bots"].astype(int)

    # Apply filters
    if map_id:
        match_agg = match_agg[match_agg["map_id"] == map_id]
    if date:
        match_agg = match_agg[match_agg["date"] == date]
    match_agg = match_agg[match_agg["total_players"] >= min_players]

    # Sort: most players first
    match_agg = match_agg.sort_values("total_players", ascending=False)

    return match_agg.to_dict(orient="records")


@app.get("/api/paths/{match_id}")
def get_paths(match_id: str):
    """
    Get all player movement paths for a match.
    Returns per-player arrays of [px, py, normalized_time] points.
    """
    df = load_all_data()
    mdf = df[df["match_id"] == match_id]

    if mdf.empty:
        raise HTTPException(404, "Match not found")

    mdf = mdf.sort_values("ts_ms")
    ts_min = mdf["ts_ms"].min()
    ts_range = max(1, mdf["ts_ms"].max() - ts_min)

    players = {}
    for uid, pdf in mdf.groupby("user_id"):
        pdf = pdf.sort_values("ts_ms")
        bot = bool(pdf["is_bot"].iloc[0])
        short_id = uid[:8] if not bot else uid

        # Movement path
        pos = pdf[pdf["event"].isin(["Position", "BotPosition"])]
        path = []
        for _, row in pos.iterrows():
            t = round((row["ts_ms"] - ts_min) / ts_range, 4)
            path.append([row["px"], row["py"], t])

        # Downsample long paths (keep every 2nd for paths > 20 points)
        if len(path) > 20:
            path = [path[0]] + path[1:-1:2] + [path[-1]]

        players[short_id] = {
            "is_bot": bot,
            "user_id": uid[:8],
            "path": path,
        }

    map_id = mdf["map_id"].iloc[0]
    return numpy_safe({"match_id": match_id, "map_id": map_id, "players": players})


@app.get("/api/events/{match_id}")
def get_events(match_id: str):
    """
    Get all non-movement events for a match (kills, deaths, loot, storm).
    """
    df = load_all_data()
    mdf = df[df["match_id"] == match_id]

    if mdf.empty:
        raise HTTPException(404, "Match not found")

    mdf = mdf.sort_values("ts_ms")
    ts_min = mdf["ts_ms"].min()
    ts_range = max(1, mdf["ts_ms"].max() - ts_min)

    event_types = ["Kill", "Killed", "BotKill", "BotKilled", "KilledByStorm", "Loot"]
    events_df = mdf[mdf["event"].isin(event_types)]

    events = []
    for _, row in events_df.iterrows():
        t = round((row["ts_ms"] - ts_min) / ts_range, 4)
        events.append({
            "type": row["event"],
            "x": row["px"],
            "y": row["py"],
            "t": t,
            "is_bot": bool(row["is_bot"]),
            "user_id": row["user_id"][:8],
        })

    map_id = mdf["map_id"].iloc[0]
    return numpy_safe({"match_id": match_id, "map_id": map_id, "events": events})


@app.get("/api/heatmap/{map_id}")
def get_heatmap(
    map_id: str,
    layer: str = "traffic",
    date: Optional[str] = None,
):
    """
    Get a heatmap grid for a specific map and layer type.
    Returns a 32x32 grid of intensity values.
    """
    if map_id not in MAP_CONFIG:
        raise HTTPException(400, f"Unknown map: {map_id}")

    df = load_all_data()
    mdf = df[df["map_id"] == map_id]

    if date:
        mdf = mdf[mdf["date"] == date]

    GS = HEATMAP_GRID
    grid = [[0] * GS for _ in range(GS)]

    event_map = {
        "traffic": ["Position", "BotPosition"],
        "kills": ["Kill", "BotKill"],
        "deaths": ["Killed", "BotKilled", "KilledByStorm"],
        "loot": ["Loot"],
    }

    target_events = event_map.get(layer, [])
    filtered = mdf[mdf["event"].isin(target_events)]

    for _, row in filtered.iterrows():
        gx = min(GS - 1, max(0, int(row["px"] / 1024 * GS)))
        gy = min(GS - 1, max(0, int(row["py"] / 1024 * GS)))
        grid[gy][gx] += 1

    max_val = max(max(r) for r in grid) or 1

    return {
        "map_id": map_id,
        "layer": layer,
        "grid_size": GS,
        "max_value": max_val,
        "grid": grid,
    }


@app.get("/api/stats")
def get_stats():
    """Global dataset statistics."""
    df = load_all_data()
    return numpy_safe({
        "total_events": int(len(df)),
        "total_matches": int(df["match_id"].nunique()),
        "total_humans": int(df[~df["is_bot"]]["user_id"].nunique()),
        "total_bots": int(df[df["is_bot"]]["user_id"].nunique()),
        "dates": sorted(df["date"].unique().tolist()),
        "maps": sorted(df["map_id"].unique().tolist()),
        "event_counts": df["event"].value_counts().to_dict(),
    })


# ============ SERVE FRONTEND (production) ============

# If a "static" folder exists (built frontend), serve it
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve React SPA — all non-API routes return index.html."""
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
