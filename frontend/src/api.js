/**
 * API client for LILA BLACK Visualizer backend.
 * In dev: proxied via Vite to localhost:8000
 * In prod: same-origin or configure VITE_API_URL
 */

const BASE = import.meta.env.VITE_API_URL || '';

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getStats() {
  return fetchJSON('/api/stats');
}

export async function getMatches({ mapId, date, minPlayers = 2 } = {}) {
  const params = new URLSearchParams();
  if (mapId) params.set('map_id', mapId);
  if (date) params.set('date', date);
  params.set('min_players', minPlayers);
  return fetchJSON(`/api/matches?${params}`);
}

export async function getPaths(matchId) {
  return fetchJSON(`/api/paths/${encodeURIComponent(matchId)}`);
}

export async function getEvents(matchId) {
  return fetchJSON(`/api/events/${encodeURIComponent(matchId)}`);
}

export async function getHeatmap(mapId, layer = 'traffic', date = null) {
  const params = new URLSearchParams({ layer });
  if (date) params.set('date', date);
  return fetchJSON(`/api/heatmap/${encodeURIComponent(mapId)}?${params}`);
}
