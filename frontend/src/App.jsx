import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getStats, getMatches, getPaths, getEvents, getHeatmap } from './api';

/* ─── Minimap images (place in /public/maps/) ─── */
const MAP_IMAGES = {
  AmbroseValley: '/maps/AmbroseValley_Minimap.png',
  GrandRift: '/maps/GrandRift_Minimap.png',
  Lockdown: '/maps/Lockdown_Minimap.jpg',
};

const MAP_LABELS = {
  AmbroseValley: 'Ambrose Valley',
  GrandRift: 'Grand Rift',
  Lockdown: 'Lockdown',
};

/* ─── Visual config ─── */
const HUMAN_COLORS = ['#00e5ff','#00bcd4','#26c6da','#4dd0e1','#80deea','#18ffff','#00acc1','#0097a7'];
const BOT_COLORS = ['#ff6b35','#ff8a5c','#e85d26','#cc4e1a','#ff7043','#ff9e80','#d84315','#bf360c'];

const EVENT_STYLE = {
  Kill:          { color: '#ff3b5c', label: 'PvP Kill' },
  Killed:        { color: '#ff3b5c', label: 'PvP Death' },
  BotKill:       { color: '#ff6b35', label: 'Bot Kill' },
  BotKilled:     { color: '#b388ff', label: 'Killed by Bot' },
  KilledByStorm: { color: '#448aff', label: 'Storm Death' },
  Loot:          { color: '#ffd740', label: 'Loot' },
};

const HEATMAP_COLORS = {
  traffic: { r: 0, g: 229, b: 255, label: 'Traffic' },
  kills:   { r: 255, g: 59, b: 92, label: 'Kill Zones' },
  deaths:  { r: 179, g: 136, b: 255, label: 'Death Zones' },
  loot:    { r: 255, g: 215, b: 64, label: 'Loot Density' },
};

function getPlayerColor(isBot, index) {
  return isBot
    ? BOT_COLORS[index % BOT_COLORS.length]
    : HUMAN_COLORS[index % HUMAN_COLORS.length];
}

/* ─────────────────────────────────────────────
   MAP CANVAS — draws minimap + paths + events + heatmap
   ───────────────────────────────────────────── */
function MapCanvas({ paths, events, heatmap, timeline, highlight, showBots, showHumans }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const mapId = paths?.map_id;

  // Load minimap image
  useEffect(() => {
    if (!mapId) return;
    setImgLoaded(false);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.onerror = () => console.error('Failed to load map image:', MAP_IMAGES[mapId]);
    img.src = MAP_IMAGES[mapId];
  }, [mapId]);

  // Draw frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    ctx.clearRect(0, 0, W, W);

    // 1. Minimap background
    if (imgRef.current && imgLoaded) {
      ctx.drawImage(imgRef.current, 0, 0, W, W);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, W);
    } else {
      ctx.fillStyle = '#12141a';
      ctx.fillRect(0, 0, W, W);
    }

    // 2. Heatmap overlay
    if (heatmap?.grid) {
      const grid = heatmap.grid;
      const GS = grid.length;
      const cellW = W / GS;
      const maxVal = heatmap.max_value || 1;
      const hc = HEATMAP_COLORS[heatmap.layer] || HEATMAP_COLORS.traffic;

      for (let r = 0; r < GS; r++) {
        for (let c = 0; c < GS; c++) {
          if (grid[r][c] === 0) continue;
          const intensity = Math.pow(grid[r][c] / maxVal, 0.55);
          ctx.fillStyle = `rgba(${hc.r},${hc.g},${hc.b},${intensity * 0.65})`;
          ctx.beginPath();
          ctx.arc(c * cellW + cellW / 2, r * cellW + cellW / 2, cellW * (0.4 + intensity * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 3. Player paths
    if (paths?.players) {
      let idx = 0;
      for (const [pid, p] of Object.entries(paths.players)) {
        if (p.is_bot && !showBots) { idx++; continue; }
        if (!p.is_bot && !showHumans) { idx++; continue; }

        const dimmed = highlight && highlight !== pid;
        const color = getPlayerColor(p.is_bot, idx);
        const visible = p.path.filter(pt => pt[2] <= timeline);

        if (visible.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = dimmed ? `${color}18` : p.is_bot ? `${color}80` : color;
          ctx.lineWidth = dimmed ? 0.8 : p.is_bot ? 1.5 : 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(visible[0][0], visible[0][1]);
          for (let i = 1; i < visible.length; i++) ctx.lineTo(visible[i][0], visible[i][1]);
          ctx.stroke();

          // Current position dot
          if (!dimmed) {
            const last = visible[visible.length - 1];
            ctx.beginPath();
            ctx.arc(last[0], last[1], p.is_bot ? 3 : 5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            if (!p.is_bot) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); }
          }
        }
        idx++;
      }
    }

    // 4. Event markers
    if (events?.events) {
      for (const ev of events.events) {
        if (ev.t > timeline) continue;
        const style = EVENT_STYLE[ev.type];
        if (!style) continue;

        if (ev.type === 'Loot') {
          const s = 4;
          ctx.beginPath();
          ctx.moveTo(ev.x, ev.y - s); ctx.lineTo(ev.x + s, ev.y);
          ctx.lineTo(ev.x, ev.y + s); ctx.lineTo(ev.x - s, ev.y);
          ctx.closePath();
          ctx.fillStyle = `${style.color}99`;
          ctx.fill();
        } else {
          // X marker for kills/deaths, circle for storm
          const s = ev.type === 'KilledByStorm' ? 6 : 7;
          if (ev.type === 'KilledByStorm') {
            ctx.beginPath();
            ctx.arc(ev.x, ev.y, s, 0, Math.PI * 2);
            ctx.fillStyle = `${style.color}bb`;
            ctx.fill();
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(ev.x - s, ev.y - s); ctx.lineTo(ev.x + s, ev.y + s);
            ctx.moveTo(ev.x + s, ev.y - s); ctx.lineTo(ev.x - s, ev.y + s);
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();
            // Glow ring
            ctx.beginPath();
            ctx.arc(ev.x, ev.y, s + 3, 0, Math.PI * 2);
            ctx.fillStyle = `${style.color}22`;
            ctx.fill();
          }
        }
      }
    }
  }, [paths, events, heatmap, timeline, imgLoaded, highlight, showBots, showHumans]);

  return (
    <canvas
      ref={canvasRef}
      width={1024}
      height={1024}
      style={{ width: '100%', maxWidth: 700, aspectRatio: '1', borderRadius: 8, border: '1px solid var(--border)' }}
    />
  );
}

/* ─────────────────────────────────────────────
   MAIN APP
   ───────────────────────────────────────────── */
export default function App() {
  // Data state
  const [stats, setStats] = useState(null);
  const [matches, setMatches] = useState([]);
  const [paths, setPaths] = useState(null);
  const [events, setEvents] = useState(null);
  const [heatmap, setHeatmap] = useState(null);

  // UI state
  const [selectedMap, setSelectedMap] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [timeline, setTimeline] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [heatmapLayer, setHeatmapLayer] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [showBots, setShowBots] = useState(true);
  const [showHumans, setShowHumans] = useState(true);
  const [showPlayers, setShowPlayers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load global stats on mount
  useEffect(() => {
    getStats().then(setStats).catch(e => setError(e.message));
  }, []);

  // Load matches when filters change
  useEffect(() => {
    setLoading(true);
    getMatches({ mapId: selectedMap || undefined, date: selectedDate || undefined, minPlayers: 2 })
      .then(data => { setMatches(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [selectedMap, selectedDate]);

  // Load match data when selection changes
  useEffect(() => {
    if (!selectedMatch) { setPaths(null); setEvents(null); return; }
    setLoading(true);
    Promise.all([getPaths(selectedMatch), getEvents(selectedMatch)])
      .then(([p, e]) => { setPaths(p); setEvents(e); setTimeline(1); setPlaying(false); setHighlight(null); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [selectedMatch]);

  // Load heatmap when layer or map changes
  useEffect(() => {
    if (!heatmapLayer) { setHeatmap(null); return; }
    const mapId = paths?.map_id || selectedMap || 'AmbroseValley';
    getHeatmap(mapId, heatmapLayer, selectedDate || undefined)
      .then(setHeatmap)
      .catch(e => setError(e.message));
  }, [heatmapLayer, paths?.map_id, selectedMap, selectedDate]);

  // Playback animation
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setTimeline(prev => {
        const next = prev + 0.004 * speed;
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [playing, speed]);

  // Auto-select first match
  useEffect(() => {
    if (matches.length > 0 && !matches.find(m => m.match_id === selectedMatch)) {
      setSelectedMatch(matches[0].match_id);
    }
  }, [matches]);

  const matchInfo = matches.find(m => m.match_id === selectedMatch);
  const playerList = paths ? Object.entries(paths.players).sort(([,a],[,b]) => a.is_bot - b.is_bot) : [];

  return (
    <div className="app">
      {/* ── TOP BAR ── */}
      <header className="topbar">
        <div className="topbar-logo">
          <h1>LILA BLACK</h1>
          <span>Player Journey Visualizer</span>
        </div>
        {stats && (
          <div className="topbar-stats">
            <span>Matches <b>{stats.total_matches}</b></span>
            <span>Players <b>{stats.total_humans}</b></span>
            <span>Events <b>{stats.total_events.toLocaleString()}</b></span>
          </div>
        )}
      </header>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        {/* Map filter */}
        <div className="filter-section">
          <div className="filter-label">Map</div>
          <div className="filter-chips">
            <button className={`chip ${selectedMap === '' ? 'active' : ''}`} onClick={() => setSelectedMap('')}>All</button>
            {['AmbroseValley', 'GrandRift', 'Lockdown'].map(m => (
              <button key={m} className={`chip ${selectedMap === m ? 'active' : ''}`} onClick={() => setSelectedMap(m)}>
                {m === 'AmbroseValley' ? 'Ambrose Valley' : m === 'GrandRift' ? 'Grand Rift' : m}
              </button>
            ))}
          </div>
        </div>

        {/* Date filter */}
        <div className="filter-section">
          <div className="filter-label">Date (Feb 2026)</div>
          <div className="filter-chips">
            <button className={`chip ${selectedDate === '' ? 'active' : ''}`} onClick={() => setSelectedDate('')}>All</button>
            {(stats?.dates || []).map(d => (
              <button key={d} className={`chip ${selectedDate === d ? 'active' : ''}`} onClick={() => setSelectedDate(d)}>
                {d.replace('2026-02-', 'Feb ')}
              </button>
            ))}
          </div>
        </div>

        {/* Visibility */}
        <div className="filter-section">
          <div className="filter-label">Visibility</div>
          <div className="filter-chips">
            <button
              className={`chip ${showHumans ? 'active' : ''}`}
              style={showHumans ? { borderColor: '#00e5ff', color: '#00e5ff', background: 'rgba(0,229,255,0.1)' } : {}}
              onClick={() => setShowHumans(!showHumans)}
            >👤 Humans</button>
            <button
              className={`chip ${showBots ? 'active' : ''}`}
              style={showBots ? { borderColor: '#ff6b35', color: '#ff6b35', background: 'rgba(255,107,53,0.1)' } : {}}
              onClick={() => setShowBots(!showBots)}
            >🤖 Bots</button>
          </div>
        </div>

        {/* Match list */}
        <div className="filter-section" style={{ borderBottom: 'none', paddingBottom: 4 }}>
          <div className="filter-label">Matches ({matches.length})</div>
        </div>
        <div className="match-list">
          {matches.map(m => (
            <div
              key={m.match_id}
              className={`match-item ${selectedMatch === m.match_id ? 'active' : ''}`}
              onClick={() => setSelectedMatch(m.match_id)}
            >
              <div className="match-item-header">
                <span className="match-item-id">{m.match_id.substring(0, 8)}</span>
                <span className={`match-item-map ${m.map_id}`}>
                  {m.map_id === 'AmbroseValley' ? 'Ambrose Valley' : m.map_id === 'GrandRift' ? 'Grand Rift' : m.map_id}
                </span>
              </div>
              <div className="match-item-stats">
                <span>{m.date.replace('2026-02-', 'Feb ')}</span>
                {m.humans > 0 && <span className="human-count">{m.humans} human{m.humans > 1 ? 's' : ''}</span>}
                <span className="bot-count">{m.bots} bots</span>
                <span>{m.total_events} events</span>
              </div>
            </div>
          ))}
          {matches.length === 0 && !loading && <div className="empty-state">No matches found</div>}
        </div>
      </aside>

      {/* ── MAIN VIEW ── */}
      <main className="main-view">
        {loading && <div className="loading-indicator">Loading...</div>}
        {error && <div className="error-banner" onClick={() => setError(null)}>⚠ {error} (click to dismiss)</div>}

        {paths ? (
          <>
            <div className="canvas-wrapper">
              <MapCanvas
                paths={paths}
                events={events}
                heatmap={heatmap}
                timeline={timeline}
                highlight={highlight}
                showBots={showBots}
                showHumans={showHumans}
              />
            </div>

            {/* Match info overlay */}
            {matchInfo && (
              <div className="overlay overlay-tl">
                <h3>{MAP_LABELS[matchInfo.map_id] || matchInfo.map_id}</h3>
                <div className="info-row">{matchInfo.date}</div>
                <div className="info-row">
                  <span style={{ color: '#00e5ff' }}>{matchInfo.humans} human</span> +{' '}
                  <span style={{ color: '#ff6b35' }}>{matchInfo.bots} bots</span>
                </div>
                <div className="info-row">{matchInfo.total_events} events</div>
              </div>
            )}

            {/* Legend overlay */}
            <div className="overlay overlay-tr">
              <div className="legend-title">Legend</div>
              <div className="legend-item"><span className="legend-line" style={{ background: '#00e5ff' }} /> Human path</div>
              <div className="legend-item"><span className="legend-line" style={{ background: '#ff6b35' }} /> Bot path</div>
              {Object.entries(EVENT_STYLE).map(([key, s]) => (
                <div key={key} className="legend-item"><span className="legend-dot" style={{ background: s.color }} /> {s.label}</div>
              ))}
            </div>

            {/* Heatmap controls */}
            <div className="overlay overlay-br heatmap-row">
              {Object.entries(HEATMAP_COLORS).map(([key, hc]) => (
                <button
                  key={key}
                  className={`heatmap-btn ${heatmapLayer === key ? 'active' : ''}`}
                  style={heatmapLayer === key ? { borderColor: `rgb(${hc.r},${hc.g},${hc.b})`, color: `rgb(${hc.r},${hc.g},${hc.b})`, background: `rgba(${hc.r},${hc.g},${hc.b},0.12)` } : {}}
                  onClick={() => setHeatmapLayer(heatmapLayer === key ? '' : key)}
                >
                  {hc.label}
                </button>
              ))}
            </div>

            {/* Player list */}
            <div className="overlay overlay-bl">
              <button className="heatmap-btn" onClick={() => setShowPlayers(!showPlayers)}>
                👥 Players ({playerList.length})
              </button>
              {showPlayers && (
                <div className="player-panel">
                  {playerList.map(([pid, p], i) => (
                    <div
                      key={pid}
                      className={`player-row ${highlight && highlight !== pid ? 'dimmed' : ''}`}
                      onClick={() => setHighlight(highlight === pid ? null : pid)}
                    >
                      <span className="player-dot" style={{ background: getPlayerColor(p.is_bot, i) }} />
                      <span className="player-label">{p.is_bot ? `Bot ${pid}` : pid}</span>
                      <span className="player-events">{p.path.length} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="placeholder">
            <div style={{ fontSize: 48, opacity: 0.25 }}>🗺️</div>
            <div>Select a match to begin exploring</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{matches.length} matches available</div>
          </div>
        )}
      </main>

      {/* ── BOTTOM CONTROLS ── */}
      <footer className="controls-bar">
        <button className="play-btn" onClick={() => { if (timeline >= 1) setTimeline(0); setPlaying(!playing); }}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="timeline-container">
          <span className="timeline-label">{Math.round(timeline * 100)}%</span>
          <input
            type="range"
            className="timeline-slider"
            min={0} max={1} step={0.001}
            value={timeline}
            onChange={e => { setTimeline(+e.target.value); setPlaying(false); }}
          />
          <span className="timeline-label">100%</span>
        </div>
        <span className="speed-label">Speed:</span>
        {[0.5, 1, 2, 4].map(s => (
          <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
        <button className="speed-btn" style={{ marginLeft: 8 }} onClick={() => { setTimeline(0); setPlaying(false); }}>
          ⟲ Reset
        </button>
      </footer>
    </div>
  );
}
