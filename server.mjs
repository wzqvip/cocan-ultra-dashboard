#!/usr/bin/env node
/**
 * Zero-dependency local server for the CP-02 dashboard.
 *
 *   node server.mjs                          # http://127.0.0.1:7788
 *   node server.mjs --host cp02-xxxx.local   # default device
 *   node server.mjs --host 192.168.1.20 --lan
 *
 * Serves the static dashboard from this folder and proxies the charger's HTTP
 * API (which has no CORS headers) under /api/*.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  buildDevice,
  normalizeJson,
  normalizePrometheus,
  normalizeHistory,
  parseInfoHtml,
} from "./lib/metrics.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = "1.0.0";
const DEFAULT_PORT = 8787;

/* ------------------------------------------------------------------ */
/* CLI                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = { host: process.env.DEVICE_HOST || "", port: DEFAULT_PORT, lan: false, allowAny: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host") opts.host = argv[++i] || "";
    else if (arg.startsWith("--host=")) opts.host = arg.slice(7);
    else if (arg === "--port") opts.port = Number(argv[++i]) || DEFAULT_PORT;
    else if (arg.startsWith("--port=")) opts.port = Number(arg.slice(7)) || DEFAULT_PORT;
    else if (arg === "--lan") opts.lan = true;
    else if (arg === "--allow-any") opts.allowAny = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`CP-02 dashboard server ${VERSION}

Usage: node server.mjs [options]

  --host <host>    default charger address (IP or *.local), also DEVICE_HOST
  --port <port>    listen port (default ${DEFAULT_PORT})
  --lan            bind 0.0.0.0 so phones on the LAN can open it (no auth!)
  --allow-any      allow proxying to non-private hosts (not recommended)
  --help           show this help
`);
      process.exit(0);
    }
  }
  if (opts.port < 1 || opts.port > 65535) opts.port = DEFAULT_PORT;
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const startedAt = Date.now();

/* ------------------------------------------------------------------ */
/* Device target validation                                           */
/* ------------------------------------------------------------------ */

class ApiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function splitTarget(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!s || /[\s/@]/.test(s)) {
    throw new ApiError("BAD_HOST", "设备地址格式不正确", 400);
  }
  const m = s.match(/^([^:]+)(?::(\d{1,5}))?$/);
  if (!m) throw new ApiError("BAD_HOST", "设备地址格式不正确", 400);
  const port = m[2] ? Number(m[2]) : 80;
  if (port < 1 || port > 65535) throw new ApiError("BAD_HOST", "端口不正确", 400);
  return { host: m[1], port };
}

function isPrivateTarget(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  // Single-label LAN hostname (router DNS suffix not required)
  return !h.includes(".");
}

function resolveTarget(raw) {
  const target = splitTarget(raw);
  if (!target) throw new ApiError("NO_DEVICE", "尚未配置设备地址", 400);
  if (!opts.allowAny && !isPrivateTarget(target.host)) {
    throw new ApiError(
      "PUBLIC_HOST",
      "只允许访问内网 / .local 设备；如确需访问公网地址，请加 --allow-any",
      400,
    );
  }
  return { ...target, base: `http://${target.host}${target.port === 80 ? "" : `:${target.port}`}` };
}

function defaultTarget() {
  return resolveTarget(opts.host || "");
}

/* ------------------------------------------------------------------ */
/* Device HTTP                                                        */
/* ------------------------------------------------------------------ */

const identityCache = new Map(); // host -> { info, endpoints, at }

async function fetchText(url, timeoutMs = 5000) {
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: { "user-agent": `cocan-ultra-dashboard/${VERSION}`, accept: "*/*" },
    });
  } catch (e) {
    const reason = e?.name === "TimeoutError" ? "连接超时" : e?.cause?.code || e?.message || "网络错误";
    throw new ApiError("DEVICE_UNREACHABLE", `无法连接设备（${reason}）`, 502);
  }
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, contentType: res.headers.get("content-type") || "" };
}

async function getIdentity(target, { timeoutMs = 5000, useCache = true } = {}) {
  const cached = identityCache.get(target.host);
  if (useCache && cached && Date.now() - cached.at < 600000) return cached;
  const res = await fetchText(`${target.base}/`, timeoutMs);
  if (!res.ok) throw new ApiError("DEVICE_HTTP", `设备首页返回 ${res.status}`, 502);
  const parsed = parseInfoHtml(res.text);
  if (!parsed.info) throw new ApiError("BAD_DEVICE", "首页不是小电拼 IonBridge 页面", 502);
  const entry = { ...parsed, at: Date.now() };
  identityCache.set(target.host, entry);
  return entry;
}

async function fetchMetricsRaw(target, mode) {
  const attempts = mode === "json" ? ["json"] : mode === "prometheus" ? ["prom"] : ["json", "prom"];
  let lastError = null;
  for (const kind of attempts) {
    const url = kind === "json" ? `${target.base}/metrics.json` : `${target.base}/metrics`;
    try {
      const res = await fetchText(url, 4500);
      if (!res.ok) {
        lastError = new ApiError("DEVICE_HTTP", `/metrics 返回 ${res.status}`, 502);
        continue;
      }
      if (kind === "json") {
        let json;
        try {
          json = JSON.parse(res.text);
        } catch {
          lastError = new ApiError("BAD_JSON", "/metrics.json 不是合法 JSON", 502);
          continue;
        }
        return { source: "metrics.json", json };
      }
      return { source: "prometheus", text: res.text };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new ApiError("DEVICE_UNREACHABLE", "无法读取设备指标", 502);
}

async function buildSnapshot(rawHost, mode = "auto") {
  const target = resolveTarget(rawHost || opts.host);
  if (!["auto", "json", "prometheus"].includes(mode)) mode = "auto";
  const t0 = Date.now();
  const warnings = [];

  // The ESP32 httpd is slow under parallel requests, so read the core metrics
  // first, then the (cached, rarely changing) identity page.
  const data = await fetchMetricsRaw(target, mode);

  let info = null;
  let endpoints = null;
  try {
    const identity = await getIdentity(target);
    info = identity.info;
    endpoints = identity.endpoints;
  } catch (e) {
    warnings.push(`设备身份读取失败：${e.message}`);
  }

  let snapshot;
  const now = Date.now();
  if (data.source === "metrics.json") {
    snapshot = normalizeJson(data.json, { info, host: target.host, now, warnings });
  } else {
    snapshot = normalizePrometheus(data.text, { info, host: target.host, now, warnings });
  }
  snapshot.mode = mode;
  snapshot.host = target.host;
  snapshot.latencyMs = Date.now() - t0;
  snapshot.endpoints = endpoints;
  return snapshot;
}

/* ------------------------------------------------------------------ */
/* Multi-device                                                       */
/* ------------------------------------------------------------------ */

function enrichSnapshot(snapshot, index) {
  return {
    ...snapshot,
    index,
    device: { ...(snapshot.device || {}), slot: index + 1 },
    ports: (snapshot.ports || []).map((port) => ({
      ...port,
      deviceIndex: index,
      globalId: index * 5 + Number(port.id),
    })),
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function sumTotals(devices) {
  const powerW = devices.reduce((sum, d) => sum + (Number(d.totals?.powerW) || 0), 0);
  const budgetW = devices.reduce((sum, d) => sum + (Number(d.totals?.budgetW) || 0), 0);
  const sessionValues = devices
    .map((d) => d.totals?.sessionWh)
    .filter((value) => Number.isFinite(value));
  return {
    powerW: Math.round(powerW * 100) / 100,
    budgetW,
    utilization: budgetW > 0 ? Math.round((powerW / budgetW) * 1000) / 10 : null,
    attachedCount: devices.reduce((sum, d) => sum + (d.totals?.attachedCount || 0), 0),
    chargingCount: devices.reduce((sum, d) => sum + (d.totals?.chargingCount || 0), 0),
    sessionWh: sessionValues.length
      ? Math.round(sessionValues.reduce((a, b) => a + b, 0) * 1000) / 1000
      : null,
    deviceCount: devices.length,
    portCount: devices.reduce((sum, d) => sum + (d.ports?.length || 5), 0),
    onlineCount: devices.length,
  };
}

async function buildMulti(hostList, mode = "auto") {
  const hosts = [...new Set((hostList || []).map((h) => String(h || "").trim()).filter(Boolean))];
  if (!hosts.length) throw new ApiError("NO_DEVICES", "没有选择设备", 400);
  if (hosts.length > 8) throw new ApiError("TOO_MANY_DEVICES", "最多同时监看 8 台设备", 400);
  if (!["auto", "json", "prometheus"].includes(mode)) mode = "auto";
  const t0 = Date.now();
  const results = await mapLimit(hosts, 3, async (host) => {
    try {
      return { ok: true, snapshot: await buildSnapshot(host, mode) };
    } catch (error) {
      return { ok: false, host, error };
    }
  });
  const devices = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.ok) devices.push(enrichSnapshot(result.snapshot, index));
    else {
      errors.push({
        host: result.host,
        error: result.error?.code || "DEVICE_ERROR",
        message: result.error?.message || "读取设备失败",
      });
    }
  });
  if (!devices.length) {
    throw new ApiError(
      "ALL_DEVICES_FAILED",
      errors.map((e) => `${e.host}: ${e.message}`).join("；") || "所有设备均不可达",
      502,
    );
  }
  return {
    ok: true,
    source: devices[0].source,
    fetchedAt: Date.now(),
    count: devices.length,
    devices,
    totals: sumTotals(devices),
    errors,
    latencyMs: Date.now() - t0,
  };
}

async function buildMultiHistory(hostList, limit) {
  const hosts = [...new Set((hostList || []).map((h) => String(h || "").trim()).filter(Boolean))];
  if (!hosts.length) throw new ApiError("NO_DEVICES", "没有选择设备", 400);
  if (hosts.length > 8) throw new ApiError("TOO_MANY_DEVICES", "最多同时监看 8 台设备", 400);
  const now = Date.now();
  const results = await mapLimit(hosts, 3, async (host) => {
    try {
      const target = resolveTarget(host);
      const res = await fetchText(`${target.base}/porthistoryz?limit=${limit}`, 6000);
      if (!res.ok) throw new ApiError("DEVICE_HTTP", `历史接口返回 ${res.status}`, 502);
      const payload = JSON.parse(res.text);
      return {
        ok: true,
        host: target.host,
        history: normalizeHistory(payload, { host: target.host, now }),
      };
    } catch (error) {
      return { ok: false, host, error };
    }
  });
  const devices = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.ok) {
      devices.push({ host: result.host, index, history: result.history });
    } else {
      errors.push({
        host: result.host,
        error: result.error?.code || "DEVICE_ERROR",
        message: result.error?.message || "读取历史失败",
      });
    }
  });
  if (!devices.length) {
    throw new ApiError("ALL_DEVICES_FAILED", errors.map((e) => `${e.host}: ${e.message}`).join("；"), 502);
  }
  return { ok: true, source: "multi-history", fetchedAt: now, devices, errors };
}

/* ------------------------------------------------------------------ */
/* LAN scan                                                           */
/* ------------------------------------------------------------------ */

function netmaskToPrefix(mask) {
  if (!mask) return null;
  const parts = String(mask).split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  let bits = 0;
  for (const part of parts) {
    let v = part;
    while (v & 0x80) {
      bits += 1;
      v = (v << 1) & 0xff;
    }
    if (v !== 0) return null;
  }
  return bits;
}

const VIRTUAL_IFACE_RE =
  /(vmware|virtualbox|vethernet|hyper-v|wsl|docker|loopback|tailscale|zerotier|vpn|tap|tun|bluetooth|蓝牙|本地连接\*)/i;

function localSubnets() {
  const ranked = [];
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    const virtual = VIRTUAL_IFACE_RE.test(iface);
    for (const addr of addrs || []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue;
      const prefix = netmaskToPrefix(addr.netmask);
      if (prefix === null || prefix < 16) continue;
      // Scan the /24 around the interface address; enough for home /22-/24 LANs.
      const base = addr.address.split(".").slice(0, 3).join(".");
      ranked.push({ iface, address: addr.address, base, prefix, virtual });
    }
  }
  const seen = new Set();
  const subnets = [];
  // Prefer physical adapters; keep virtual ones only when nothing better exists.
  ranked.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  for (const item of ranked) {
    if (seen.has(item.base)) continue;
    seen.add(item.base);
    subnets.push({ iface: item.iface, address: item.address, base: item.base });
    if (subnets.length >= 4) break;
  }
  const physical = subnets.filter((s) => !VIRTUAL_IFACE_RE.test(s.iface));
  return (physical.length ? physical : subnets).slice(0, 4);
}

async function scanLan() {
  const subnets = localSubnets();
  const targets = [];
  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i += 1) {
      const ip = `${subnet.base}.${i}`;
      if (ip !== subnet.address) targets.push(ip);
    }
  }
  const devices = [];
  let cursor = 0;
  const CONCURRENCY = 64;
  async function worker() {
    while (cursor < targets.length) {
      const ip = targets[cursor];
      cursor += 1;
      try {
        const res = await fetchText(`http://${ip}/metrics.json`, 500);
        if (!res.ok) continue;
        const data = JSON.parse(res.text);
        if (!data || !Array.isArray(data.ports)) continue;
        let info = null;
        try {
          const root = await fetchText(`http://${ip}/`, 800);
          info = parseInfoHtml(root.text).info;
        } catch {
          /* metrics-only device is still useful */
        }
        devices.push({
          host: ip,
          ip,
          name: info?.device_name || "小电拼",
          psn: info?.psn || null,
          model: info?.device_model || "",
          modelLabel: buildDevice(info).modelLabel,
          ports: data.ports.length,
          rssi: data?.wifi?.rssi ?? null,
        });
      } catch {
        /* closed port / timeout: normal */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  devices.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return { subnets, devices };
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                       */
/* ------------------------------------------------------------------ */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const ALLOWED_STATIC_FILES = new Set([
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/robots.txt",
]);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...JSON_HEADERS, "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

function sendError(res, error) {
  const err = error instanceof ApiError ? error : new ApiError("INTERNAL", error?.message || "内部错误", 500);
  sendJson(res, err.status, { ok: false, error: err.code, message: err.message });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const isAllowed =
    ALLOWED_STATIC_FILES.has(rel) || rel.startsWith("/assets/") || rel.startsWith("/docs/screenshots/");
  if (!isAllowed) {
    sendJson(res, 404, { ok: false, error: "NOT_FOUND", message: "Not found" });
    return;
  }
  const filePath = path.resolve(ROOT, `.${rel}`);
  if (!filePath.startsWith(ROOT + path.sep)) {
    sendJson(res, 403, { ok: false, error: "FORBIDDEN", message: "Forbidden" });
    return;
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    sendJson(res, 404, { ok: false, error: "NOT_FOUND", message: "Not found" });
    return;
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { ok: false, error: "NOT_FOUND", message: "Not found" });
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    "content-type": MIME[ext] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": rel === "/index.html" ? "no-cache" : "public, max-age=300",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

/* ------------------------------------------------------------------ */
/* API router                                                         */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", message: "Only GET" });
    return;
  }
  const hostParam = url.searchParams.get("host") || "";
  const route = url.pathname;

  if (route === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      name: "cocan-ultra-dashboard",
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      defaultHost: opts.host || null,
      lan: opts.lan,
    });
    return;
  }

  if (route === "/api/scan") {
    const result = await scanLan();
    sendJson(res, 200, { ok: true, scannedAt: Date.now(), ...result });
    return;
  }

  if (route === "/api/snapshot") {
    const mode = url.searchParams.get("mode") || "auto";
    const snapshot = await buildSnapshot(hostParam, mode);
    sendJson(res, 200, snapshot);
    return;
  }

  if (route === "/api/multi") {
    const mode = url.searchParams.get("mode") || "auto";
    const hosts = (url.searchParams.get("hosts") || "").split(",");
    const result = await buildMulti(hosts, mode);
    sendJson(res, 200, result);
    return;
  }

  if (route === "/api/multi-history") {
    const hosts = (url.searchParams.get("hosts") || "").split(",");
    const limit = Math.max(2, Math.min(Number(url.searchParams.get("limit")) || 180, 720));
    const result = await buildMultiHistory(hosts, limit);
    sendJson(res, 200, result);
    return;
  }

  if (route === "/api/history") {
    const target = resolveTarget(hostParam || opts.host);
    const limit = Math.max(2, Math.min(Number(url.searchParams.get("limit")) || 180, 720));
    const res2 = await fetchText(`${target.base}/porthistoryz?limit=${limit}`, 6000);
    if (!res2.ok) throw new ApiError("DEVICE_HTTP", `历史接口返回 ${res2.status}`, 502);
    let payload;
    try {
      payload = JSON.parse(res2.text);
    } catch {
      throw new ApiError("BAD_JSON", "/porthistoryz 不是合法 JSON", 502);
    }
    sendJson(res, 200, normalizeHistory(payload, { host: target.host, now: Date.now() }));
    return;
  }

  if (route === "/api/info") {
    const target = resolveTarget(hostParam || opts.host);
    const t0 = Date.now();
    const identity = await getIdentity(target, { useCache: false });
    sendJson(res, 200, {
      ok: true,
      host: target.host,
      device: buildDevice(identity.info),
      endpoints: identity.endpoints,
      config: identity.config,
      latencyMs: Date.now() - t0,
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "NOT_FOUND", message: "Unknown API route" });
}

/* ------------------------------------------------------------------ */
/* Server                                                             */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    if (!res.headersSent) sendError(res, error);
    else res.end();
  }
});

const bindHost = opts.lan ? "0.0.0.0" : "127.0.0.1";

async function listenWithFallback(startPort, attempts = 24) {
  for (let i = 0; i < attempts; i += 1) {
    const port = startPort + i;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, bindHost);
      });
      return port;
    } catch (error) {
      if ((error.code === "EACCES" || error.code === "EADDRINUSE") && i < attempts - 1) {
        console.warn(`端口 ${port} 不可用（${error.code}），尝试 ${port + 1}…`);
        continue;
      }
      throw error;
    }
  }
  throw new Error("找不到可用端口");
}

listenWithFallback(opts.port)
  .then((port) => {
    // Runtime errors after a successful listen are fatal.
    server.on("error", (error) => {
      console.error(error);
      process.exit(1);
    });
    const lan = opts.lan
      ? Object.values(os.networkInterfaces())
          .flat()
          .filter((a) => a && a.family === "IPv4" && !a.internal)
          .map((a) => a.address)
      : [];
    console.log(`\n  小电拼 CP-02 仪表盘  v${VERSION}`);
    console.log(`  → http://127.0.0.1:${port}`);
    for (const ip of lan) console.log(`  → http://${ip}:${port}  (局域网)`);
    console.log(
      `  设备: ${opts.host || "未指定（在页面右上角设置，或启动时加 --host）"}\n`,
    );
    if (opts.lan) console.log("  ⚠ --lan 模式对同一局域网开放且无鉴权，请勿在公共 Wi-Fi 使用\n");
    if (opts.host) {
      try {
        const target = resolveTarget(opts.host);
        getIdentity(target).catch(() => {});
      } catch {
        /* validated on first API call */
      }
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
