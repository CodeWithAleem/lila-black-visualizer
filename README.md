# LILA BLACK — Player Journey Visualizer

A web tool for Level Designers to explore player movement, combat hotspots, and loot patterns across LILA BLACK maps using 5 days of production telemetry data.

## 🔗 Live Demo

- **Frontend:** https://lila-black-visualizer.vercel.app
- **Backend API:** https://lila-black-visualizer.onrender.com/docs

---

## ⚠️ First Visit (Important)

The backend runs on Render's free tier and sleeps after 15 minutes of inactivity. Before using the tool:

1. Open https://lila-black-visualizer.onrender.com/api/health — wait for `{"status":"ok"}`
2. Open https://lila-black-visualizer.onrender.com/api/stats — wait for JSON to load (~30-60 seconds)
3. Now open https://lila-black-visualizer.vercel.app — everything loads instantly

After the first load, all data is cached and responses are instant.

## Quick Start (Local Development)

### Prerequisites
- Python 3.10+
- Node.js 18+
- The `player_data/` folder with parquet files

### 1. Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Verify: http://localhost:8000/api/stats should return JSON with dataset stats.

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173 — the Vite dev server proxies `/api` calls to port 8000 automatically.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Global stats: total events, matches, players, dates |
| `/api/matches?map_id=&date=&min_players=2` | GET | Match list with filters |
| `/api/paths/{match_id}` | GET | Player movement paths (pixel coordinates) |
| `/api/events/{match_id}` | GET | Combat/loot/storm events for a match |
| `/api/heatmap/{map_id}?layer=traffic&date=` | GET | 32×32 heatmap grid |

### Heatmap layers: `traffic`, `kills`, `deaths`, `loot`

---

## Deployment

### Backend → Render.com

1. Push `backend/` folder to a Git repo
2. Include `player_data/` in the repo (or use Render's persistent disk)
3. Create new Web Service on Render:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variable:** `DATA_DIR=./player_data`

### Frontend → Vercel

1. Push `frontend/` folder to a Git repo
2. Create new project on Vercel, point to the `frontend/` folder
3. Set environment variable:
   - `VITE_API_URL=https://your-backend-url.onrender.com`
4. Update `vercel.json` — replace `YOUR_BACKEND_URL` with your Render URL
5. Deploy

### Alternative: Railway (backend)

1. Push backend to GitHub
2. Connect to Railway → auto-detects `Procfile`
3. Set `DATA_DIR=./player_data`

---

## Project Structure

```
├── backend/
│   ├── main.py              ← FastAPI app with all endpoints
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── Procfile             ← Railway deployment
│   ├── render.yaml          ← Render deployment
│   └── player_data/         ← Parquet telemetry files
│       ├── February_10/
│       ├── February_11/
│       ├── February_12/
│       ├── February_13/
│       └── February_14/
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json          ← Vercel routing + API proxy
│   ├── public/
│   │   └── maps/            ← Minimap images (1024×1024)
│   │       ├── AmbroseValley_Minimap.png
│   │       ├── GrandRift_Minimap.png
│   │       └── Lockdown_Minimap.jpg
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          ← Main React component
│       ├── App.css          ← Dark gaming theme
│       └── api.js           ← Backend API client
│
├── ARCHITECTURE.md          ← Tech decisions & trade-offs
├── INSIGHTS.md              ← 3 data-driven game insights
└── README.md                ← This file
```

## Data Summary

| Metric | Value |
|--------|-------|
| Date Range | Feb 10–14, 2026 |
| Total Events | 89,104 |
| Unique Humans | 245 |
| Unique Bots | 94 |
| Matches (multi-player) | 53 |
| Maps | AmbroseValley, GrandRift, Lockdown |

## Features Checklist

- [x] Player paths on minimap with correct coordinate mapping
- [x] Human vs bot visual distinction (cyan vs orange)
- [x] Event markers: Kill, Death, Loot, Storm
- [x] Filter by map, date, and match
- [x] Timeline playback with speed control
- [x] Heatmap overlays: traffic, kills, deaths, loot
- [x] Player list with individual highlighting
- [x] Architecture doc with coordinate mapping explanation
- [x] Three insights with evidence and recommendations
