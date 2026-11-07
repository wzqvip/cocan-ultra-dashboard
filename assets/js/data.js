/**
 * Browser data client for the CP-02 dashboard.
 *
 * The device HTTP server does not send CORS headers, so live data goes through
 * the local zero-dependency proxy in server.mjs. Demo data is generated fully
 * client-side (GitHub Pages / ?demo=1).
 *
 * Public API is documented in docs/DATA-CONTRACT.md.
 */

import { demoSnapshot, demoHistory } from "./demo.js";
import { decodeProtocol, portColor, portName, portType } from "./protocols.js";

export { decodeProtocol, portColor, portName, portType };

export const SETTINGS_KEY = "cocan-dash.settings.v1";
export const DEFAULT_SETTINGS = {
  host: "",
  mode: "auto", // auto | json | prometheus
  theme: "auto", // auto | light | dark
  lang: "zh", // zh | en
  intervalMs: 3000,
  window: "30m", // 30m | 2h | 5m
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...(patch || {}) };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
  return next;
}

export function resetSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function getUrlOverrides() {
  const params = new URLSearchParams(location.search);
  return {
    host: params.get("host") || "",
    mode: params.get("mode") || "",
    demo: params.get("demo") === "1",
  };
}

/** GitHub Pages / file:// / ?demo=1 → demo data (no device reachable). */
export function isDemoLocation() {
  if (getUrlOverrides().demo) return true;
  if (location.protocol === "file:") return true;
  return /(^|\.)github\.io$/i.test(location.hostname);
}

export function isDemoSnapshot(snapshot) {
  return snapshot?.source === "demo" || snapshot?.mode === "demo";
}

async function fetchJson(path, { timeoutMs = 8000 } = {}) {
  if (typeof fetch !== "function") throw new Error("浏览器不支持 fetch");
  if (!/^https?:$/.test(location.protocol)) {
    throw new Error("请通过 http://127.0.0.1:8787 打开（file:// 无法访问代理）");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok === false) {
      const err = new Error(body?.message || body?.error || `HTTP ${res.status}`);
      err.code = body?.error || `HTTP_${res.status}`;
      err.status = res.status;
      throw err;
    }
    return body;
  } catch (e) {
    if (e.name === "AbortError") {
      const err = new Error("设备响应超时");
      err.code = "TIMEOUT";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}

export async function getSnapshot({ host, mode } = {}) {
  return fetchJson(`/api/snapshot${buildQuery({ host, mode })}`);
}

export async function getHistory({ host, limit = 180 } = {}) {
  return fetchJson(`/api/history${buildQuery({ host, limit })}`, { timeoutMs: 12000 });
}

export async function getInfo({ host } = {}) {
  return fetchJson(`/api/info${buildQuery({ host })}`, { timeoutMs: 6000 });
}

export async function probeProxy() {
  return fetchJson("/api/health", { timeoutMs: 3000 });
}

export async function scanLan() {
  return fetchJson("/api/scan", { timeoutMs: 25000 });
}

export function demo() {
  const now = Date.now();
  return demoSnapshot(now);
}

export function demoHistoryFor(now = Date.now(), limit = 180) {
  return demoHistory(now, limit);
}

export function effectiveSettings() {
  const settings = loadSettings();
  const url = getUrlOverrides();
  return {
    ...settings,
    host: url.host || settings.host,
    mode: url.mode || settings.mode,
    demo: isDemoLocation(),
  };
}

/* ------------------------------------------------------------------ */
/* History accumulation (localStorage, 2h by default)                 */
/* ------------------------------------------------------------------ */

const HISTORY_PREFIX = "cocan-dash.history.v1";

export class HistoryStore {
  constructor(host, { maxAgeMs = 2 * 3600 * 1000, minGapMs = 3000, saveEveryMs = 8000 } = {}) {
    this.host = host || "default";
    this.key = `${HISTORY_PREFIX}:${this.host}`;
    this.maxAgeMs = maxAgeMs;
    this.minGapMs = minGapMs;
    this.saveEveryMs = saveEveryMs;
    this.ports = new Map(); // id -> { id, name, type, samples: [{t,powerW,voltageMv,currentMa}] }
    this.lastSave = 0;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.ports)) return;
      for (const p of parsed.ports) {
        if (!Number.isInteger(p.id) || !Array.isArray(p.samples)) continue;
        this.ports.set(p.id, {
          id: p.id,
          name: p.name || portName(p.id),
          type: p.type || portType(p.id),
          samples: p.samples
            .filter((s) => Number.isFinite(s?.t) && Number.isFinite(s?.powerW))
            .slice(-4000),
        });
      }
      this.trim(Date.now());
    } catch {
      /* corrupted history is non-fatal */
    }
  }

  trim(now = Date.now()) {
    const minT = now - this.maxAgeMs;
    for (const p of this.ports.values()) {
      if (!p.samples.length) continue;
      let start = 0;
      while (start < p.samples.length && p.samples[start].t < minT) start += 1;
      if (start > 0) p.samples = p.samples.slice(start);
    }
  }

  append(port, sample) {
    let entry = this.ports.get(port.id);
    if (!entry) {
      entry = { id: port.id, name: port.name, type: port.type, samples: [] };
      this.ports.set(port.id, entry);
    }
    const last = entry.samples[entry.samples.length - 1];
    if (last && sample.t - last.t < this.minGapMs) {
      entry.samples[entry.samples.length - 1] = sample;
      return;
    }
    if (last && sample.t <= last.t) return;
    entry.samples.push(sample);
    if (entry.samples.length > 4000) entry.samples.splice(0, entry.samples.length - 4000);
  }

  add(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.ports)) return;
    const t = Number(snapshot.fetchedAt) || Date.now();
    for (const p of snapshot.ports) {
      this.append(p, {
        t,
        powerW: p.powerW,
        voltageMv: p.voltageMv,
        currentMa: p.currentMa,
      });
    }
    this.trim(t);
    this.maybeSave();
  }

  merge(history) {
    if (!history || !Array.isArray(history.ports)) return;
    for (const p of history.ports) {
      const samples = p.samples || [];
      for (const s of samples) {
        if (!Number.isFinite(s?.t) || !Number.isFinite(s?.powerW)) continue;
        this.append({ id: p.id, name: p.name, type: p.type }, {
          t: s.t,
          powerW: s.powerW,
          voltageMv: s.voltageMv,
          currentMa: s.currentMa,
        });
      }
    }
    this.trim(Date.now());
    this.save();
  }

  maybeSave() {
    const now = Date.now();
    if (now - this.lastSave < this.saveEveryMs) return;
    this.save();
  }

  save() {
    this.lastSave = Date.now();
    try {
      const ports = [...this.ports.values()].map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        samples: p.samples,
      }));
      localStorage.setItem(this.key, JSON.stringify({ host: this.host, updatedAt: Date.now(), ports }));
    } catch {
      /* quota exceeded: keep in-memory only */
    }
  }

  series() {
    return [...this.ports.values()]
      .sort((a, b) => a.id - b.id)
      .map((p) => ({ id: p.id, name: p.name, type: p.type, samples: p.samples }));
  }

  clear() {
    this.ports.clear();
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

const DASH = "—";

export function fmtWatts(w) {
  if (!Number.isFinite(w)) return DASH;
  const digits = w >= 100 ? 0 : w >= 10 ? 1 : 2;
  return `${w.toFixed(digits).replace(/\.?0+$/, "")} W`;
}

export function fmtVolts(mv) {
  if (!Number.isFinite(mv)) return DASH;
  return `${(mv / 1000).toFixed(2).replace(/0$/, "").replace(/\.$/, "")} V`;
}

export function fmtAmps(ma) {
  if (!Number.isFinite(ma)) return DASH;
  return `${(ma / 1000).toFixed(2).replace(/0$/, "").replace(/\.$/, "")} A`;
}

export function fmtEnergy(wh) {
  if (!Number.isFinite(wh)) return DASH;
  if (wh >= 1) return `${wh.toFixed(2)} Wh`;
  return `${Math.round(wh * 1000)} mWh`;
}

export function fmtUptime(seconds) {
  if (!Number.isFinite(seconds)) return DASH;
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return DASH;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function fmtRssi(rssi) {
  if (!Number.isFinite(rssi)) return DASH;
  return `${Math.round(rssi)} dBm`;
}

export function fmtClock(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtRelative(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return DASH;
  const diff = Math.max(0, now - ts);
  if (diff < 1000) return "刚刚";
  if (diff < 60000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  return `${Math.floor(diff / 3600000)} 小时前`;
}
