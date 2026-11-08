/**
 * CP-02 dashboard application: single & multi-device state, polling, rendering,
 * device discovery/selection and the official-app Pro/Simple views.
 *
 * Data access is delegated to ./data.js (documented in docs/DATA-CONTRACT.md).
 */

import {
  HistoryStore,
  aggregateSnapshots,
  demoMulti,
  demoMultiHistoryFor,
  effectiveSettings,
  fmtAmps,
  fmtBytes,
  fmtClock,
  fmtEnergy,
  fmtRssi,
  fmtUptime,
  fmtVolts,
  fmtWatts,
  getDevices,
  getHistory,
  getMulti,
  getMultiHistory,
  getSnapshot,
  getUrlOverrides,
  portColor,
  portName,
  portType,
  probeProxy,
  removeDevice,
  resetSettings,
  saveSettings,
  scanLan,
  setActiveDevice,
  setMultiSelection,
  updateDeviceMeta,
  upsertDevice,
} from "./data.js";
import { PowerChart, drawSparkline } from "./charts.js";
import { applyI18n, getLang, protocolLabel, setLang, t } from "./i18n.js";
import { createDiagram } from "./diagram.js";

const PORT_IDS = [0, 1, 2, 3, 4];
const MAX_DEVICES = 6;
const RANGES = { "5m": 5 * 60 * 1000, "30m": 30 * 60 * 1000, "2h": 2 * 60 * 60 * 1000 };
const RANGE_SUB = { "5m": "chartSub5m", "30m": "chartSub30m", "2h": "chartSub2h" };
const HISTORY_MAX_AGE = 2 * 60 * 60 * 1000;
const DEVICE_COLORS = ["#FF7315", "#2C89FB", "#22C55E", "#A855F7", "#EC4899", "#0EA5E9"];
const PANEL_DEFS = [
  { id: "hero", selector: "#hero" },
  { id: "flow", selector: ".diagram-card" },
  { id: "chart", selector: ".chart-card" },
  { id: "ports", selector: ".ports-card" },
];
const PANEL_SIZE_KEY = "cocan.panelSizes";
const PANEL_EXPAND_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 3.5H3.5v4M12.5 3.5h4v4M7.5 16.5H3.5v-4M12.5 16.5h4v-4"/></svg>';
const PANEL_CLOSE_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';

const WARN_STATES = new Set([
  "OVER_TEMP_WARNING",
  "OVER_TEMP_ALERT",
  "COOLING",
  "LIMITED_POWER",
  "DEAD",
  "BOOTING",
  "CHECKING",
  "RECOVERING",
  "DETACHING",
  "OPENING",
  "CLOSING",
]);

const STATUS_KEYS = {
  loading: "statusLoading",
  live: "statusLive",
  demo: "statusDemo",
  stale: "statusStale",
  offline: "statusOffline",
  setup: "statusSetup",
};

const BANNER_ICONS = {
  info: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7.4"/><path d="M10 9v4.6M10 6.6v.2" stroke-linecap="round"/></svg>',
  warn: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.2 17.3 16H2.7L10 3.2Z"/><path d="M10 8v3.4M10 13.6v.3" stroke-linecap="round"/></svg>',
  bad: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7.4"/><path d="m7.4 7.4 5.2 5.2M12.6 7.4l-5.2 5.2" stroke-linecap="round"/></svg>',
  demo: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.8 12 7l4.7.5-3.5 3.2.9 4.7-4.1-2.3-4.1 2.3.9-4.7L3.3 7.5 8 7l2-4.2Z"/></svg>',
};

const state = {
  settings: null,
  demo: false,
  demoCount: 1,
  multi: false,
  status: "loading",
  loading: true,
  aggregate: null,
  devices: [],
  selectedPort: null, // { globalId, deviceIndex, portId }
  lastGood: null,
  lastGoodAt: 0,
  lastError: null,
  lastErrorCode: "",
  stores: new Map(),
  chart: null,
  diagrams: new Map(),
  diagramSignature: "",
  view: "pro",
  range: "30m",
  hidden: new Set(),
  portNodes: new Map(),
  deviceGroupNodes: new Map(),
  portSignature: "",
  timer: 0,
  gen: 0,
  polling: false,
  refreshQueued: false,
  backoff: 0,
  detailOpen: false,
  detailReturnFocus: null,
  lastAnnounceAt: 0,
  legendSignature: "",
  chartSeriesMeta: [],
  chartLineIds: ["total"],
  chartHasData: false,
  historySeeded: false,
  refreshSpinnerUntil: 0,
  staleTimer: 0,
  themeQuery: null,
  resolvedTheme: "light",
  discovery: {
    active: false,
    scanning: false,
    started: false,
    results: [],
    statusKey: "",
    statusVars: null,
    error: null,
    scannedAt: 0,
  },
  deviceDialogMode: "single",
  multiDraft: new Set(),
  deviceScan: { scanning: false, results: [], statusKey: "", error: null },
};

const dom = {};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function cacheDom() {
  dom.root = document.documentElement;
  dom.brandTitle = $("#brandTitle");
  dom.deviceSwitch = $("#deviceSwitch");
  dom.deviceSwitchLabel = $("#deviceSwitchLabel");
  dom.statusPill = $("#statusPill");
  dom.statusText = $("#statusText");
  dom.fwVersion = $("#fwVersion");
  dom.psnText = $("#psnText");
  dom.langBtn = $("#langBtn");
  dom.langLabel = $("#langLabel");
  dom.themeBtn = $("#themeBtn");
  dom.settingsBtn = $("#settingsBtn");
  dom.refreshBtn = $("#refreshBtn");
  dom.banners = $("#banners");
  dom.hero = $("#hero");
  dom.heroFresh = $("#heroFresh");
  dom.heroMeta = $("#heroMeta");
  dom.totalW = $("#totalW");
  dom.budgetBar = $("#budgetBar");
  dom.budgetFill = $("#budgetFill");
  dom.budgetText = $("#budgetText");
  dom.budgetUtil = $("#budgetUtil");
  dom.statPorts = $("#statPorts");
  dom.statEnergy = $("#statEnergy");
  dom.statLabel3 = $("#statLabel3");
  dom.statValue3 = $("#statValue3");
  dom.statLabel4 = $("#statLabel4");
  dom.statValue4 = $("#statValue4");
  dom.diagramWrap = $("#diagramWrap");
  dom.simpleWrap = $("#simpleWrap");
  dom.meterWrap = $("#meterWrap");
  dom.cuktechWrap = $("#cuktechWrap");
  dom.viewTabs = $("#viewTabs");
  dom.replayBtn = $("#replayBtn");
  dom.flowSub = $("#flowSub");
  dom.chartWrap = $("#chartWrap");
  dom.chart = $("#powerChart");
  dom.chartOverlay = $("#chartOverlay");
  dom.chartOverlayText = $("#chartOverlayText");
  dom.chartSub = $("#chartSub");
  dom.rangeTabs = $("#rangeTabs");
  dom.chartLegend = $("#chartLegend");
  dom.portGrid = $("#portGrid");
  dom.setupCard = $("#setupCard");
  dom.setupCmd = $("#setupCmd");
  dom.setupDemoLink = $("#setupDemoLink");
  dom.setupDemoTwoLink = $("#setupDemoTwoLink");
  dom.discoveryScanBtn = $("#discoveryScanBtn");
  dom.discoveryStatus = $("#discoveryStatus");
  dom.discoveryList = $("#discoveryList");
  dom.manualHost = $("#manualHost");
  dom.manualAddBtn = $("#manualAddBtn");
  dom.sysDetails = $("#systemDetails");
  dom.sysGrid = $("#sysGrid");
  dom.sourceBadge = $("#sourceBadge");
  dom.promNote = $("#promNote");
  dom.footStatus = $("#footStatus");
  dom.liveRegion = $("#liveRegion");
  dom.detailLayer = $("#detailLayer");
  dom.detailSheet = $("#detailSheet");
  dom.detailDot = $("#detailDot");
  dom.detailTitle = $("#detailTitle");
  dom.detailDevice = $("#detailDevice");
  dom.detailState = $("#detailState");
  dom.detailW = $("#detailW");
  dom.detailProto = $("#detailProto");
  dom.detailGrid = $("#detailGrid");
  dom.detailClose = $("#detailClose");
  dom.detailSpark = $("#detailSpark");
  dom.detailSparkMeta = $("#detailSparkMeta");
  dom.deviceDialog = $("#deviceDialog");
  dom.deviceDialogClose = $("#deviceDialogClose");
  dom.deviceDialogDone = $("#deviceDialogDone");
  dom.deviceModeTabs = $("#deviceModeTabs");
  dom.deviceModeHint = $("#deviceModeHint");
  dom.savedDeviceList = $("#savedDeviceList");
  dom.savedSectionTitle = $("#savedSectionTitle");
  dom.savedCount = $("#savedCount");
  dom.deviceScanBtn = $("#deviceScanBtn");
  dom.deviceScanStatus = $("#deviceScanStatus");
  dom.deviceScanList = $("#deviceScanList");
  dom.deviceManualHost = $("#deviceManualHost");
  dom.deviceManualAdd = $("#deviceManualAdd");
  dom.deviceApplyMulti = $("#deviceApplyMulti");
  dom.demoOneLink = $("#demoOneLink");
  dom.demoTwoLink = $("#demoTwoLink");
  dom.settingsDialog = $("#settingsDialog");
  dom.settingsForm = $("#settingsForm");
  dom.settingsClose = $("#settingsClose");
  dom.cancelBtn = $("#cancelBtn");
  dom.resetBtn = $("#resetBtn");
  dom.setHost = $("#setHost");
  dom.setMode = $("#setMode");
  dom.setInterval = $("#setInterval");
  dom.setTheme = $("#setTheme");
  dom.setLang = $("#setLang");
  dom.urlHostNote = $("#urlHostNote");
  dom.manageDevicesBtn = $("#manageDevicesBtn");
  dom.testBtn = $("#testBtn");
  dom.scanBtn = $("#scanBtn");
  dom.testStatus = $("#testStatus");
  dom.scanPanel = $("#scanPanel");
  dom.scanList = $("#scanList");
  dom.scanCount = $("#scanCount");
  dom.setupHint = $("#setupHint");
}

/* ------------------------------------------------------------------ */
/* Resizable panels + in-page fullscreen                              */
/* ------------------------------------------------------------------ */

function readPanelSizes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PANEL_SIZE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePanelSizes(sizes) {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(sizes));
  } catch {
    /* storage full/blocked: resizing still works for this session */
  }
}

function setPanelFullscreenButton(panel, on) {
  const button = panel.querySelector(".panel-fs");
  if (!button) return;
  const key = on ? "panelExitFullscreen" : "panelFullscreen";
  button.dataset.i18nTitle = key;
  button.dataset.i18nAria = key;
  button.title = t(key);
  button.setAttribute("aria-label", t(key));
  button.setAttribute("aria-pressed", String(on));
  button.innerHTML = on ? PANEL_CLOSE_ICON : PANEL_EXPAND_ICON;
}

function exitPanelFullscreen(panel) {
  if (!panel?.classList.contains("is-fullscreen")) return;
  panel.classList.remove("is-fullscreen");
  const prevRole = panel.dataset.prevRole || "";
  if (prevRole) panel.setAttribute("role", prevRole);
  else panel.removeAttribute("role");
  panel.removeAttribute("aria-modal");
  delete panel.dataset.prevRole;
  if (!document.querySelector(".card.is-fullscreen")) {
    document.body.classList.remove("panel-fullscreen-open");
  }
  setPanelFullscreenButton(panel, false);
  window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

function enterPanelFullscreen(panel) {
  if (!panel || panel.classList.contains("is-fullscreen")) return;
  const previous = document.querySelector(".card.is-fullscreen");
  if (previous) exitPanelFullscreen(previous);
  panel.dataset.prevRole = panel.getAttribute("role") || "";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.classList.add("is-fullscreen");
  document.body.classList.add("panel-fullscreen-open");
  setPanelFullscreenButton(panel, true);
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
    panel.querySelector(".panel-fs")?.focus({ preventScroll: true });
  });
}

function togglePanelFullscreen(panel) {
  if (panel.classList.contains("is-fullscreen")) exitPanelFullscreen(panel);
  else enterPanelFullscreen(panel);
}

function initPanelControls() {
  for (const def of PANEL_DEFS) {
    const panel = $(def.selector);
    if (!panel) continue;
    panel.dataset.panel = def.id;
    panel.dataset.panelResizable = "true";
    panel.dataset.i18nTitle = "panelResize";
    panel.title = t("panelResize");

    const saved = readPanelSizes()[def.id];
    if (saved) {
      const maxWidth = Math.max(260, window.innerWidth - 24);
      if (Number(saved.w) > 0) panel.style.width = `${Math.min(Number(saved.w), maxWidth)}px`;
      if (Number(saved.h) > 0) panel.style.height = `${Math.min(Number(saved.h), 4000)}px`;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-fs";
    button.dataset.i18nTitle = "panelFullscreen";
    button.dataset.i18nAria = "panelFullscreen";
    button.title = t("panelFullscreen");
    button.setAttribute("aria-label", t("panelFullscreen"));
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = PANEL_EXPAND_ICON;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePanelFullscreen(panel);
    });
    panel.append(button);

    if (typeof ResizeObserver === "function") {
      let saveTimer = 0;
      const observer = new ResizeObserver(() => {
        if (panel.classList.contains("is-fullscreen")) return;
        const width = Number.parseFloat(panel.style.width);
        const height = Number.parseFloat(panel.style.height);
        if (!Number.isFinite(width) && !Number.isFinite(height)) return;
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          const sizes = readPanelSizes();
          const entry = { ...(sizes[def.id] || {}) };
          if (Number.isFinite(width)) entry.w = Math.round(width);
          if (Number.isFinite(height)) entry.h = Math.round(height);
          sizes[def.id] = entry;
          writePanelSizes(sizes);
          window.dispatchEvent(new Event("resize"));
        }, 180);
      });
      observer.observe(panel);
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const panel = document.querySelector(".card.is-fullscreen");
    if (!panel) return;
    event.preventDefault();
    exitPanelFullscreen(panel);
  });
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function powerParts(watts) {
  if (!Number.isFinite(watts)) return "—";
  return watts >= 100 ? String(Math.round(watts)) : watts.toFixed(1);
}

function mixHex(hex, target, ratio) {
  const parse = (value) => {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value).trim());
    if (!match) return null;
    const int = parseInt(match[1], 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  };
  const from = parse(hex);
  const to = parse(target);
  if (!from || !to) return hex;
  const channel = (index) => Math.round(from[index] + (to[index] - from[index]) * ratio);
  return `#${[0, 1, 2].map((index) => channel(index).toString(16).padStart(2, "0")).join("")}`;
}

function chartLineColor(hex) {
  if (state.resolvedTheme !== "light") return hex;
  return mixHex(hex, "#1b130a", 0.38);
}

function chartPortColor(id) {
  return chartLineColor(portColor(id));
}

function chartDeviceColor(index) {
  return chartLineColor(DEVICE_COLORS[Number(index) % DEVICE_COLORS.length]);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtDateTime(ts) {
  if (!Number.isFinite(ts)) return "—";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (getLang() === "en") {
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${secs} 秒`;
  return `${secs} 秒`;
}

function maskPsn(psn) {
  if (!psn) return "—";
  const value = String(psn);
  if (value.length <= 4) return "••••";
  return `•••• •••• ${value.slice(-4)}`;
}

function maskMac(mac) {
  if (!mac) return "—";
  const parts = String(mac).split(":");
  if (parts.length !== 6) return String(mac);
  return `${parts[0]}:${parts[1]}:${parts[2]}:••:••:${parts[5]}`;
}

function sourceLabel(source) {
  if (source === "demo") return t("sourceDemo");
  if (source === "prometheus") return t("sourceProm");
  if (source === "metrics.json") return t("sourceJson");
  return "—";
}

function stateText(port) {
  if (!port) return t("stateIdle");
  const raw = String(port.state || "").toUpperCase();
  const map = {
    OVER_TEMP_WARNING: "stateOverTempWarn",
    OVER_TEMP_ALERT: "stateOverTempAlert",
    COOLING: "stateCooling",
    LIMITED_POWER: "stateLimitedPower",
    DEAD: "stateDead",
    BOOTING: "stateBooting",
    CHECKING: "stateChecking",
    RECOVERING: "stateRecovering",
    DETACHING: "stateDetaching",
    OPENING: "stateOpening",
    CLOSING: "stateClosing",
  };
  if (map[raw]) return t(map[raw]);
  if (port.active === false || raw === "INACTIVE") return t("stateInactive");
  if (port.attached) {
    return (Number(port.powerW) || 0) >= 0.1 ? t("stateCharging") : t("stateAttachedIdle");
  }
  return t("stateIdle");
}

function stateTone(port) {
  if (!port) return "off";
  const raw = String(port.state || "").toUpperCase();
  if (port.active === false || raw === "INACTIVE") return "off";
  if (WARN_STATES.has(raw)) return "warn";
  if (port.attached && (Number(port.powerW) || 0) >= 0.1) return "charging";
  if (port.attached) return "attached";
  return "idle";
}

function findPort(snapshot, id) {
  if (!snapshot || !Array.isArray(snapshot.ports)) return null;
  return snapshot.ports.find((port) => Number(port.id) === Number(id)) || null;
}

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/* ------------------------------------------------------------------ */
/* Device / settings helpers                                          */
/* ------------------------------------------------------------------ */

function savedDevices() {
  return getDevices();
}

// Keep saved device labels in sync with the live snapshot (e.g. Pro vs Ultra),
// so the device dialog does not keep a stale "Pro / Ultra" label forever.
function syncSavedDeviceMeta(devices) {
  if (state.demo) return;
  let changed = false;
  for (const device of devices || []) {
    const snapshot = device.device || {};
    const host = device.host || hostForRequests();
    if (!host) continue;
    const meta = {
      name: snapshot.name || "",
      psn: snapshot.psn || "",
      model: snapshot.model || "",
      modelLabel: snapshot.modelLabel || "",
      lastSeen: Number(device.fetchedAt) || Date.now(),
    };
    const existing = savedDevices().find((item) => item.host === host);
    if (!existing) {
      upsertDevice({ host, ...meta });
      changed = true;
      continue;
    }
    if (updateDeviceMeta(host, meta).updated) changed = true;
  }
  if (changed) {
    state.settings = effectiveSettings();
    if (getDevices().length > 0) state.discovery.active = false;
    if (dom.deviceDialog?.open) renderDeviceDialog();
  }
}

function sortedDevices() {
  return [...state.devices].sort((a, b) => Number(a.index) - Number(b.index));
}

function primaryDevice() {
  return sortedDevices()[0] || null;
}

function deviceKey(device) {
  return device?.host || `slot-${device?.index ?? 0}`;
}

function deviceLabel(device) {
  return t("deviceLabel", { n: Number(device?.index ?? 0) + 1 });
}

function deviceName(device) {
  return device?.device?.name || device?.host || deviceLabel(device);
}

function isLiveMulti() {
  return Boolean(
    !state.demo &&
      state.settings?.multi &&
      Array.isArray(state.settings.multiHosts) &&
      state.settings.multiHosts.length > 1,
  );
}

function totalDeviceCount() {
  if (state.demo) return state.demoCount;
  if (isLiveMulti()) return state.settings.multiHosts.length;
  return 1;
}

function onlineDeviceCount() {
  return state.devices.length;
}

function energyAvailableAll() {
  if (!state.devices.length) return false;
  return state.devices.every((device) => device.capabilities?.energy !== false);
}

function aggregateTotals() {
  if (state.aggregate?.totals) return state.aggregate.totals;
  return aggregateSnapshots(state.devices, Date.now()).totals;
}

function inputVoltageAverage() {
  const values = state.devices
    .map((device) => Number(device.totals?.inputVoltageV))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

function chargingDeviceCount() {
  return state.devices.filter((device) => (Number(device.totals?.chargingCount) || 0) > 0).length;
}

function storeForHost(host) {
  const key = host || "default";
  let store = state.stores.get(key);
  if (!store) {
    store = new HistoryStore(key, { maxAgeMs: HISTORY_MAX_AGE, minGapMs: 3000 });
    state.stores.set(key, store);
  }
  return store;
}

function storeForDevice(device) {
  return storeForHost(deviceKey(device));
}

function primaryStore() {
  const device = primaryDevice();
  if (!device) return null;
  return state.stores.get(deviceKey(device)) || null;
}

function globalIdFor(device, portId) {
  const port = findPort(device, portId);
  if (port && Number.isFinite(Number(port.globalId))) return Number(port.globalId);
  return Number(device.index || 0) * 5 + Number(portId);
}

function resolvePort(globalId) {
  const target = Number(globalId);
  for (const device of sortedDevices()) {
    for (const port of device.ports || []) {
      const gid = Number.isFinite(Number(port.globalId))
        ? Number(port.globalId)
        : Number(device.index) * 5 + Number(port.id);
      if (gid === target) return { device, port };
    }
  }
  return null;
}

function portCapability(device, portId) {
  const declared = Number(device?.device?.portMaxW?.[portId]);
  if (Number.isFinite(declared) && declared > 0) return declared;
  return Number(portId) === 0 ? 60 : 140;
}

/* ------------------------------------------------------------------ */
/* URLs and settings helpers                                          */
/* ------------------------------------------------------------------ */

function hostForRequests() {
  const url = getUrlOverrides();
  return url.host || state.settings?.host || "";
}

function modeForRequests() {
  const url = getUrlOverrides();
  return url.mode || state.settings?.mode || "auto";
}

function urlWithDemo(count = 1) {
  const url = new URL(location.href);
  url.searchParams.set("demo", String(count));
  url.searchParams.delete("demoDevices");
  url.searchParams.delete("multi");
  // A previous real-mode link leaves ?local=1 / ?api=... behind. Demo mode
  // must explicitly remove them, otherwise isDemoLocation() still returns
  // real and the UI snaps back to the device.
  url.searchParams.delete("local");
  url.searchParams.delete("api");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Leave demo mode for real data.
 * On GitHub Pages, removing ?demo is not enough: the page is still a demo
 * location. Switch to the local proxy mode (?local=1) explicitly.
 */
function urlForRealMode() {
  const url = new URL(location.href);
  url.searchParams.delete("demo");
  url.searchParams.delete("demoDevices");
  url.searchParams.delete("multi");
  if (
    /(^|\.)github\.io$/i.test(location.hostname) &&
    !url.searchParams.get("local") &&
    !url.searchParams.get("api")
  ) {
    url.searchParams.set("local", "1");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function currentInterval() {
  const value = Number(state.settings?.intervalMs);
  return Math.min(60000, Math.max(1500, Number.isFinite(value) ? value : 3000));
}

function staleLimit() {
  return Math.max(3 * currentInterval(), 15000);
}

function isProxyError(error) {
  if (!error) return false;
  const code = String(error.code || "").toUpperCase();
  if (code === "NO_DEVICE" || code === "NO_DEVICES") return false;
  if (code === "TIMEOUT") return false;
  if (code === "NOT_FOUND" || code === "HTTP_404") return true;
  if (code.startsWith("HTTP_")) return true;
  return error.name === "TypeError";
}

function syncMultiFlag() {
  if (state.demo) {
    state.multi = state.demoCount > 1;
  } else {
    state.multi = isLiveMulti() || state.devices.length > 1;
  }
}

/* ------------------------------------------------------------------ */
/* Theme                                                              */
/* ------------------------------------------------------------------ */

function resolveTheme(preference) {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  state.resolvedTheme = resolved;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#121417" : "#f4efe6");
  if (state.chart) {
    renderFlow();
    refreshChart();
  }
}

/* ------------------------------------------------------------------ */
/* Status / banners                                                   */
/* ------------------------------------------------------------------ */

function deriveStatus() {
  if (state.demo) return "demo";
  if (state.loading && !state.lastGood) return "loading";
  if (!state.lastGood) {
    if (!state.lastError) return "loading";
    const code = String(state.lastErrorCode || "").toUpperCase();
    if (code === "NO_DEVICE" || code === "NO_DEVICES") return "setup";
    if (code === "ALL_DEVICES_FAILED" && !getDevices().length) return "setup";
    return "offline";
  }
  if (state.lastError) return "offline";
  if (Date.now() - state.lastGoodAt > staleLimit()) return "stale";
  return "live";
}

function updateStatus(status = deriveStatus()) {
  state.status = status;
  dom.statusPill.dataset.state = status;
  dom.statusText.textContent = t(STATUS_KEYS[status] || "statusLoading");
}

function updateStaleIfNeeded() {
  if (state.demo || document.hidden) return;
  if (!state.lastGood || state.lastError) return;
  const status = deriveStatus();
  if (status !== state.status) {
    updateStatus(status);
    renderBanners();
  }
}

function makeBanner({ tone = "info", title, text, actions = [] }) {
  const banner = document.createElement("div");
  banner.className = "banner";
  banner.dataset.tone = tone;
  const icon = document.createElement("span");
  icon.className = "banner-icon";
  icon.innerHTML = BANNER_ICONS[tone] || BANNER_ICONS.info;
  const body = document.createElement("div");
  body.className = "banner-body";
  if (title) {
    const heading = document.createElement("p");
    heading.className = "banner-title";
    heading.textContent = title;
    body.append(heading);
  }
  if (text) {
    const paragraph = document.createElement("p");
    paragraph.className = "banner-text";
    paragraph.textContent = text;
    body.append(paragraph);
  }
  if (actions.length > 0) {
    const row = document.createElement("div");
    row.className = "banner-actions";
    for (const action of actions) {
      if (action.href) {
        const link = document.createElement("a");
        link.className = `btn ${action.kind === "primary" ? "btn-primary" : "btn-soft"}`;
        link.href = action.href;
        link.textContent = action.label;
        row.append(link);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn ${action.kind === "primary" ? "btn-primary" : "btn-soft"}`;
        button.dataset.action = action.action;
        button.textContent = action.label;
        row.append(button);
      }
    }
    body.append(row);
  }
  banner.append(icon, body);
  return banner;
}

function renderBanners() {
  const status = deriveStatus();
  const banners = [];
  const signatureParts = [];

  if (state.demo) {
    const count = state.devices.length || state.demoCount;
    const actions = [];
    actions.push({ label: t("useRealDevice"), href: urlForRealMode() });
    if (getUrlOverrides().demo) {
      actions.push(
        count > 1
          ? { label: t("demoOne"), href: urlWithDemo(1) }
          : { label: t("demoTwo"), href: urlWithDemo(2) },
      );
    }
    banners.push({
      tone: "demo",
      title: t("demoBannerTitle"),
      text: count > 1 ? t("demoBannerTextMulti", { n: count }) : t("demoBannerText"),
      actions,
    });
  } else if (status === "offline") {
    const proxy = isProxyError(state.lastError);
    const actions = [{ label: t("retry"), action: "retry", kind: "primary" }];
    actions.push({ label: t("openSettings"), action: "settings" });
    if (proxy) {
      banners.push({
        tone: "bad",
        title: t("proxyMissingTitle"),
        text: t("proxyMissingText"),
        actions: [...actions, { label: t("enterDemo"), href: urlWithDemo(1) }],
      });
    } else {
      banners.push({
        tone: "bad",
        title: t("offlineTitle"),
        text: state.lastGood
          ? t("offlineText", { time: fmtClock(state.lastGood.fetchedAt) })
          : state.lastError?.message || t("offlineNoData"),
        actions: [...actions, { label: t("devicesTitle"), action: "devices" }],
      });
    }
  } else if (status === "stale") {
    banners.push({
      tone: "warn",
      title: t("staleTitle"),
      text: t("staleText", { time: fmtClock(state.lastGood?.fetchedAt) }),
      actions: [{ label: t("retry"), action: "retry" }],
    });
  } else if (status === "setup" && !state.discovery.active) {
    banners.push({
      tone: "info",
      title: t("setupTitle"),
      text: t("noDeviceHint"),
      actions: [
        { label: t("devicesTitle"), action: "devices", kind: "primary" },
        { label: t("scanLan"), action: "scan" },
        { label: t("enterDemo"), href: urlWithDemo(1) },
      ],
    });
  }

  if (!state.demo && getUrlOverrides().local && status !== "live") {
    banners.push({
      tone: "info",
      title: t("localModeTitle"),
      text: t("localModeText"),
      actions: [
        { label: t("retry"), action: "retry", kind: "primary" },
        { label: t("openSettings"), action: "settings" },
      ],
    });
  }

  if (!state.demo && state.aggregate?.errors?.length && status !== "offline") {
    const lines = state.aggregate.errors.slice(0, 3).map((item) =>
      t("partialText", { host: item.host || "—", message: item.message || item.error || "—" }),
    );
    banners.push({
      tone: "warn",
      title: t("partialTitle"),
      text: lines.join(" · "),
      actions: [
        { label: t("retry"), action: "retry" },
        { label: t("devicesTitle"), action: "devices" },
      ],
    });
  }

  if (!state.demo && state.devices.length > 0 && status !== "offline") {
    const warningHost = state.devices.find((device) => (device.warnings || []).length) || null;
    const warnings = (warningHost?.warnings || [])
      .map((warning) => String(warning))
      .filter((warning) => warning && !warning.includes("演示"))
      .slice(0, 2);
    for (const warning of warnings) {
      banners.push({ tone: "warn", title: t("warningsTitle"), text: warning });
    }
  }

  for (const banner of banners) {
    signatureParts.push(`${banner.tone}|${banner.title || ""}|${banner.text || ""}`);
  }
  const signature = signatureParts.join("~");
  if (signature === state.bannerSignature) return;
  state.bannerSignature = signature;
  dom.banners.replaceChildren(...banners.map(makeBanner));
}

/* ------------------------------------------------------------------ */
/* Discovery (first run)                                              */
/* ------------------------------------------------------------------ */

function discoveryVisible() {
  if (state.demo) return false;
  if (!state.discovery.active) return false;
  if (savedDevices().length > 0) return false;
  if (state.lastGood) return false;
  return true;
}

function setDiscoveryStatus(key, vars = null) {
  state.discovery.statusKey = key;
  state.discovery.statusVars = vars;
}

function renderDiscovery() {
  const visible = discoveryVisible();
  dom.setupCard.hidden = !visible;
  if (!visible) return;

  dom.discoveryScanBtn.disabled = state.discovery.scanning;
  dom.discoveryScanBtn.textContent = state.discovery.scanning ? t("scanning") : t("scanLan");
  dom.discoveryStatus.textContent = state.discovery.statusKey
    ? t(state.discovery.statusKey, state.discovery.statusVars || undefined)
    : "";
  dom.discoveryList.replaceChildren();

  for (const device of state.discovery.results) {
    const item = document.createElement("li");
    item.className = "discovery-item";
    const text = document.createElement("div");
    text.className = "discovery-item-text";
    const name = document.createElement("p");
    name.className = "discovery-name";
    name.textContent = device.name || device.host || device.ip || "—";
    const meta = document.createElement("p");
    meta.className = "discovery-meta";
    meta.textContent = [
      device.host || device.ip,
      device.psn ? `PSN ${maskPsn(device.psn)}` : "",
      Number.isFinite(Number(device.rssi)) ? fmtRssi(Number(device.rssi)) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    text.append(name, meta);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-primary";
    add.textContent = t("addAndUse");
    add.addEventListener("click", () => {
      addDeviceEntry(device, { use: true });
    });
    item.append(text, add);
    dom.discoveryList.append(item);
  }

  if (state.discovery.results.length === 0 && state.discovery.statusKey === "discoveryEmpty") {
    const empty = document.createElement("li");
    empty.className = "discovery-item";
    empty.textContent = t("discoveryEmpty");
    dom.discoveryList.append(empty);
  }

  dom.setupCmd.textContent = `node server.mjs${hostForRequests() ? ` --host ${hostForRequests()}` : " --host cp02-xxxx.local"}`;
}

function activateDiscovery(autoScan = true) {
  if (state.demo) return;
  if (savedDevices().length > 0) return;
  state.discovery.active = true;
  renderDiscovery();
  if (autoScan && !state.discovery.started) {
    state.discovery.started = true;
    startDiscoveryScan({ auto: true });
  }
}

async function startDiscoveryScan({ auto = false } = {}) {
  if (state.discovery.scanning) return;
  state.discovery.scanning = true;
  setDiscoveryStatus("discoveryScanning");
  renderDiscovery();
  try {
    const result = await scanLan();
    state.discovery.results = Array.isArray(result?.devices) ? result.devices : [];
    state.discovery.scannedAt = Date.now();
    state.discovery.error = null;
    setDiscoveryStatus(
      state.discovery.results.length ? "discoveryFound" : "discoveryEmpty",
      { n: state.discovery.results.length },
    );
  } catch (error) {
    state.discovery.results = [];
    state.discovery.error = error;
    setDiscoveryStatus(isProxyError(error) ? "scanProxyMissing" : "discoveryError");
  } finally {
    state.discovery.scanning = false;
    renderDiscovery();
  }
}

function addDeviceEntry(device, { use = false } = {}) {
  const host = String(device.host || device.ip || "").trim();
  if (!host) return;
  upsertDevice({
    host,
    name: device.name || "",
    psn: device.psn || "",
    model: device.model || "",
    modelLabel: device.modelLabel || "",
    lastSeen: Date.now(),
  });
  state.settings = effectiveSettings();
  hideDiscoveryIfReady();
  if (use) {
    setActiveDevice(host);
    state.settings = effectiveSettings();
    reinitializeData();
    closeDeviceDialog();
  } else {
    renderHeader();
    renderDeviceDialog();
  }
}

function hideDiscoveryIfReady() {
  if (savedDevices().length > 0) {
    state.discovery.active = false;
  }
  renderDiscovery();
}

/* ------------------------------------------------------------------ */
/* Header / hero                                                      */
/* ------------------------------------------------------------------ */

function updateDeviceSwitch() {
  const primary = primaryDevice();
  let label;
  if (state.demo) {
    label = `${t("statusDemo")} · ${t("multiBadge", { n: state.demoCount })}`;
  } else if (state.multi) {
    label = t("multiBadge", { n: state.devices.length || totalDeviceCount() });
  } else {
    label = primary ? deviceName(primary) : hostForRequests() || t("discoveryTitle");
  }
  dom.deviceSwitchLabel.textContent = label;
  dom.deviceSwitch.dataset.multi = String(state.multi);
  const bits = [label];
  if (primary) {
    bits.push(primary.device?.modelLabel || primary.device?.name || "", primary.host || "");
  }
  dom.deviceSwitch.title = bits.filter(Boolean).join(" · ");
  dom.deviceSwitch.setAttribute("aria-label", `${t("deviceSwitchAria")}: ${label}`);
}

function renderHeader() {
  const primary = primaryDevice();
  const device = primary?.device || {};
  const display =
    typeof device.modelLabel === "string" && device.modelLabel.trim()
      ? device.modelLabel.replace(/（[^）]*）|\([^)]*\)/g, "").trim() || device.modelLabel
      : "AI 小电拼 Pro / Ultra";
  dom.brandTitle.textContent = display;
  dom.brandTitle.title = device.modelLabel || display;
  updateDeviceSwitch();

  const fw = device.esp32Version || primary?.system?.appVersion;
  dom.fwVersion.textContent = fw ? String(fw) : "—";
  const psn = device.psn;
  const psnKey = dom.psnText.previousElementSibling;
  if (state.multi) {
    if (psnKey) psnKey.textContent = t("deviceCount");
    dom.psnText.textContent = t("multiBadge", { n: state.devices.length || totalDeviceCount() });
    dom.psnText.title = "";
  } else {
    if (psnKey) psnKey.textContent = t("labelPsn");
    dom.psnText.textContent = state.demo ? psn || "—" : maskPsn(psn);
    dom.psnText.title = state.demo ? String(psn || "") : t("labelPsn");
  }
}

function setUnavailable(element, unavailable, title) {
  element.classList.toggle("is-unavailable", Boolean(unavailable));
  if (title) element.title = title;
  else element.removeAttribute("title");
}

function renderHero() {
  const totals = aggregateTotals();
  const hasData = state.devices.length > 0;
  const energyAvailable = hasData && energyAvailableAll();
  const budget = Number(totals?.budgetW) || (hasData ? 160 * state.devices.length : 160);
  const ports = Number(totals?.portCount) || (hasData ? 5 * state.devices.length : 5);
  const power = Number(totals?.powerW);
  const utilizationRaw = Number(totals?.utilization);
  const utilization = Number.isFinite(utilizationRaw)
    ? utilizationRaw
    : Number.isFinite(power) && budget > 0
      ? (power / budget) * 100
      : NaN;

  dom.totalW.textContent = hasData ? powerParts(power) : "—";
  dom.totalW.classList.remove("is-skel");

  const clamped = Number.isFinite(utilization) ? Math.max(0, Math.min(100, utilization)) : 0;
  dom.budgetFill.style.width = `${clamped}%`;
  dom.budgetFill.dataset.level = utilization >= 100 ? "over" : utilization >= 80 ? "high" : "normal";
  dom.budgetBar.setAttribute("aria-valuemax", String(Math.round(budget)));
  dom.budgetBar.setAttribute("aria-valuenow", String(Number.isFinite(utilization) ? Math.round(utilization) : 0));
  dom.budgetBar.setAttribute(
    "aria-valuetext",
    Number.isFinite(utilization)
      ? `${Math.round(utilization)}% · ${powerParts(power)} W / ${Math.round(budget)} W`
      : "—",
  );
  dom.budgetText.textContent = t("budgetOf", { budget: Math.round(budget) });
  dom.budgetUtil.textContent = Number.isFinite(utilization) ? `${utilization.toFixed(1)}%` : "—";
  dom.heroFresh.textContent = state.aggregate ? t("updatedAt", { time: fmtClock(state.aggregate.fetchedAt) }) : "—";

  const chargingDevices = chargingDeviceCount();
  const metaParts = [];
  if (hasData) {
    metaParts.push(t("capacityLabel", { budget: Math.round(budget), ports }));
    metaParts.push(t("devicesCharging", { n: chargingDevices }));
  } else {
    metaParts.push("—");
  }
  dom.heroMeta.replaceChildren();
  metaParts.forEach((part, index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "meta-sep";
      sep.textContent = "·";
      sep.setAttribute("aria-hidden", "true");
      dom.heroMeta.append(sep);
    }
    const span = document.createElement("span");
    span.textContent = part;
    dom.heroMeta.append(span);
  });

  if (!hasData) {
    dom.statPorts.textContent = "—";
    setUnavailable(dom.statEnergy, false);
    dom.statEnergy.textContent = "—";
    dom.statLabel3.textContent = t("inputVoltage");
    dom.statValue3.textContent = "—";
    dom.statLabel4.textContent = t("uptime");
    dom.statValue4.textContent = "—";
    return;
  }

  dom.statPorts.textContent = t("portsValue", {
    attached: Number(totals?.attachedCount) || 0,
    charging: Number(totals?.chargingCount) || 0,
  });

  if (!energyAvailable) {
    setUnavailable(dom.statEnergy, true, t("energyUnavailable"));
    dom.statEnergy.textContent = "—";
  } else {
    setUnavailable(dom.statEnergy, false, t("energyTip"));
    dom.statEnergy.textContent = fmtEnergy(Number(totals?.sessionWh));
  }
  const energyNote = dom.statEnergy.parentElement?.querySelector(".unit-note");
  if (energyNote) energyNote.hidden = !energyAvailable;

  if (state.multi) {
    dom.statLabel3.textContent = t("deviceCount");
    dom.statValue3.textContent = t("devicesOnline", {
      online: onlineDeviceCount(),
      total: totalDeviceCount(),
    });
    dom.statLabel4.textContent = t("inputVoltage");
    const average = inputVoltageAverage();
    const vinAvailable = Number.isFinite(average) && average > 0;
    dom.statValue4.textContent = vinAvailable ? `${average.toFixed(2)} V` : "—";
    setUnavailable(dom.statValue4, !vinAvailable, t("energyUnavailable"));
    dom.statLabel4.removeAttribute("title");
  } else {
    dom.statLabel3.textContent = t("inputVoltage");
    const primary = primaryDevice();
    let inputVoltage = Number(primary?.totals?.inputVoltageV);
    if (!Number.isFinite(inputVoltage) || inputVoltage <= 0) {
      inputVoltage = inputVoltageAverage();
    }
    const vinAvailable = Number.isFinite(inputVoltage) && inputVoltage > 0;
    dom.statValue3.textContent = vinAvailable ? `${inputVoltage.toFixed(2)} V` : "—";
    setUnavailable(dom.statValue3, !vinAvailable, t("energyUnavailable"));
    dom.statLabel4.textContent = t("uptime");
    dom.statValue4.textContent = fmtUptime(Number(primary?.system?.uptimeSeconds));
    dom.statLabel4.removeAttribute("title");
  }
}

/* ------------------------------------------------------------------ */
/* Port cards                                                         */
/* ------------------------------------------------------------------ */

function createPortCard(device, portId) {
  const globalId = globalIdFor(device, portId);
  const li = document.createElement("li");
  li.className = "port-card";
  li.dataset.port = String(portId);
  li.dataset.global = String(globalId);
  li.style.setProperty("--pc", portColor(portId));

  const button = document.createElement("button");
  button.type = "button";
  button.className = "port-btn";

  const top = document.createElement("span");
  top.className = "pc-top";
  const name = document.createElement("span");
  name.className = "pc-name";
  const type = document.createElement("span");
  type.className = "pc-type";
  const global = document.createElement("span");
  global.className = "pc-global";
  global.textContent = `P${globalId}`;
  global.hidden = !state.multi;
  const status = document.createElement("span");
  status.className = "pc-state";
  top.append(name, type, global, status);

  const power = document.createElement("span");
  power.className = "pc-power";
  const num = document.createElement("span");
  num.className = "pc-num";
  const unit = document.createElement("span");
  unit.className = "pc-w";
  unit.textContent = "W";
  power.append(num, unit);

  const meta = document.createElement("span");
  meta.className = "pc-meta";
  const proto = document.createElement("span");
  proto.className = "badge proto-badge";
  const sub = document.createElement("span");
  sub.className = "pc-sub";
  meta.append(proto, sub);

  const foot = document.createElement("span");
  foot.className = "pc-foot";
  const energy = document.createElement("span");
  energy.className = "pc-energy";
  const time = document.createElement("span");
  time.className = "pc-time";
  foot.append(energy, time);

  const spark = document.createElement("canvas");
  spark.className = "pc-spark";
  spark.setAttribute("aria-hidden", "true");

  button.append(top, power, meta, foot, spark);
  li.append(button);
  button.addEventListener("click", () => openDetail(globalId));

  return { globalId, li, button, name, type, global, status, num, proto, sub, energy, time, spark };
}

function ensurePortStructure() {
  const devices = sortedDevices();
  const signature = `${state.multi ? "m" : "s"}|${devices
    .map((device) => `${device.index}:${device.host || ""}:${device.device?.name || ""}`)
    .join("|")}`;
  if (signature === state.portSignature) return;
  state.portSignature = signature;
  state.portNodes.clear();
  state.deviceGroupNodes.clear();
  dom.portGrid.replaceChildren();

  for (const device of devices) {
    const group = document.createElement("section");
    group.className = "device-group";
    group.dataset.device = String(device.index);

    let head = null;
    if (state.multi) {
      head = document.createElement("header");
      head.className = "device-group-head";
      const index = document.createElement("span");
      index.className = "device-group-index";
      index.textContent = deviceLabel(device);
      const name = document.createElement("span");
      name.className = "device-group-name";
      name.textContent = deviceName(device);
      const total = document.createElement("span");
      total.className = "device-group-total";
      head.append(index, name, total);
      group.append(head);
    }

    const list = document.createElement("ul");
    list.className = "port-grid";
    for (const portId of PORT_IDS) {
      const card = createPortCard(device, portId);
      state.portNodes.set(card.globalId, { ...card, device, portId });
      list.append(card.li);
    }
    group.append(list);
    dom.portGrid.append(group);
    state.deviceGroupNodes.set(Number(device.index), { group, head, name: head?.querySelector(".device-group-name"), total: head?.querySelector(".device-group-total"), device });
  }
}

function renderPorts() {
  ensurePortStructure();
  const energyAll = energyAvailableAll();
  const now = Date.now();
  const selectedId = state.selectedPort ? Number(state.selectedPort.globalId) : NaN;

  for (const device of sortedDevices()) {
    const groupRefs = state.deviceGroupNodes.get(Number(device.index));
    if (groupRefs?.total) {
      const charging = Number(device.totals?.chargingCount) || 0;
      groupRefs.total.textContent = `${fmtWatts(Number(device.totals?.powerW))} · ${t("groupCharging", { n: charging })}`;
    }

    for (const portId of PORT_IDS) {
      const globalId = globalIdFor(device, portId);
      const refs = state.portNodes.get(globalId);
      if (!refs) continue;
      const port = findPort(device, portId);
      const power = Number(port?.powerW);
      const charging = Boolean(port && port.attached && power >= 0.1 && port.active !== false);
      const inactive = Boolean(port && port.active === false);
      const idle = !port || !port.attached || inactive;
      const energyAvailable = device.capabilities?.energy !== false;

      refs.li.style.setProperty("--pc", portColor(portId));
      refs.li.classList.toggle("is-charging", charging);
      refs.li.classList.toggle("is-idle", idle);
      refs.li.classList.toggle("is-off", inactive);
      refs.li.classList.toggle("is-selected", selectedId === globalId);
      refs.global.hidden = !state.multi;

      refs.name.textContent = port?.name || portName(portId);
      refs.type.textContent = t((port?.type || portType(portId)) === "A" ? "portTypeA" : "portTypeC");
      refs.status.textContent = stateText(port);
      refs.status.dataset.tone = stateTone(port);
      refs.num.textContent = port ? powerParts(power) : "—";
      refs.proto.textContent = port ? protocolLabel(port) : "—";
      refs.sub.textContent =
        port && port.attached
          ? `${fmtVolts(Number(port.voltageMv))} · ${fmtAmps(Number(port.currentMa))}`
          : "—";

      if (!energyAvailable) {
        refs.energy.textContent = "—";
        refs.energy.title = t("energyUnavailable");
        refs.time.textContent = "—";
        refs.time.removeAttribute("title");
      } else if (port && port.attached) {
        refs.energy.textContent = `≈ ${fmtEnergy(Number(port.sessionWh))}`;
        refs.energy.title = t("energyTip");
        refs.time.textContent = fmtDuration(Number(port.chargingSeconds));
        refs.time.title = t("chargeTime");
      } else {
        refs.energy.textContent = "—";
        refs.energy.removeAttribute("title");
        refs.time.textContent = "—";
        refs.time.removeAttribute("title");
      }

      refs.button.setAttribute(
        "aria-label",
        `${state.multi ? `${deviceLabel(device)} ` : ""}${t("portAria", {
          name: port?.name || portName(portId),
          power: port ? fmtWatts(power) : "—",
          state: stateText(port),
        })}`,
      );

      const store = state.stores.get(deviceKey(device));
      const series = store?.series().find((entry) => entry.id === portId);
      if (series && refs.spark.offsetParent !== null) {
        const samples = series.samples.filter((sample) => sample.t >= now - 30 * 60 * 1000);
        drawSparkline(refs.spark, samples, portColor(portId));
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Simple view (official app style)                                   */
/* ------------------------------------------------------------------ */

function renderSimple() {
  dom.simpleWrap.replaceChildren();
  const devices = sortedDevices();
  if (devices.length === 0) return;

  const totals = aggregateTotals();
  const budget = Number(totals?.budgetW) || 160 * devices.length;
  const ports = Number(totals?.portCount) || 5 * devices.length;
  const summary = document.createElement("div");
  summary.className = "simple-summary";
  const cap = document.createElement("span");
  cap.className = "simple-cap";
  cap.textContent = t("capacityLabel", { budget: Math.round(budget), ports });
  const charging = document.createElement("span");
  charging.className = "simple-charging";
  charging.textContent = t("devicesCharging", { n: chargingDeviceCount() });
  summary.append(cap, charging);
  dom.simpleWrap.append(summary);

  for (const device of devices) {
    const group = document.createElement("section");
    group.className = "simple-group";

    if (state.multi) {
      const head = document.createElement("div");
      head.className = "simple-group-head";
      const label = document.createElement("span");
      label.className = "sg-label";
      label.textContent = deviceLabel(device);
      const name = document.createElement("span");
      name.className = "sg-name";
      name.textContent = deviceName(device);
      const total = document.createElement("span");
      total.className = "sg-total";
      total.textContent = `${fmtWatts(Number(device.totals?.powerW))} · ${t("groupCharging", {
        n: Number(device.totals?.chargingCount) || 0,
      })}`;
      head.append(label, name, total);
      group.append(head);
    }

    const rows = document.createElement("div");
    rows.className = "simple-rows";
    const deviceBudget = Number(device.totals?.budgetW) || 160;

    for (const portId of PORT_IDS) {
      const port = findPort(device, portId);
      const globalId = globalIdFor(device, portId);
      const power = Number(port?.powerW) || 0;
      const capability = portCapability(device, portId);
      const trackPct = Math.max(6, Math.min(100, (capability / deviceBudget) * 100));
      const fillPct = capability > 0 ? Math.max(0, Math.min(100, (power / capability) * 100)) : 0;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "simple-row";
      row.style.setProperty("--pc", portColor(portId));
      row.setAttribute(
        "aria-label",
        `${state.multi ? `${deviceLabel(device)} ` : ""}${t("portAria", {
          name: port?.name || portName(portId),
          power: fmtWatts(power),
          state: stateText(port),
        })}`,
      );
      row.addEventListener("click", () => openDetail(globalId));

      const portLabel = document.createElement("span");
      portLabel.className = "simple-port";
      const dot = document.createElement("span");
      dot.className = "simple-dot";
      const text = document.createElement("span");
      text.textContent = port?.name || portName(portId);
      portLabel.append(dot, text);

      const trackWrap = document.createElement("span");
      trackWrap.className = "simple-track-wrap";
      const track = document.createElement("span");
      track.className = "simple-track";
      track.style.width = `${trackPct}%`;
      const fill = document.createElement("span");
      fill.className = "simple-fill";
      fill.style.width = `${fillPct}%`;
      track.append(fill);
      trackWrap.append(track);

      const value = document.createElement("span");
      value.className = "simple-val";
      const strong = document.createElement("b");
      strong.textContent = powerParts(power);
      value.append(strong, document.createTextNode(" W "));
      const proto = document.createElement("span");
      proto.className = "simple-proto";
      proto.textContent = protocolLabel(port);
      value.append(proto);

      row.append(portLabel, trackWrap, value);
      rows.append(row);
    }
    group.append(rows);
    dom.simpleWrap.append(group);
  }
}

/* ------------------------------------------------------------------ */
/* Meter view (Power-Z style 2×2 grid)                                */
/* ------------------------------------------------------------------ */

function meterMetric(label, value) {
  const item = document.createElement("div");
  item.className = "meter-metric";
  const key = document.createElement("span");
  key.className = "meter-metric-label";
  key.textContent = label;
  const val = document.createElement("b");
  val.className = "meter-metric-value";
  val.textContent = value;
  item.append(key, val);
  return item;
}

function renderMeter() {
  dom.meterWrap.replaceChildren();
  const devices = sortedDevices();
  if (devices.length === 0) return;
  const totals = aggregateTotals();
  const energy = energyAvailableAll();
  const budget = Number(totals?.budgetW) || 160 * devices.length;
  const portCount = Number(totals?.portCount) || 5 * devices.length;

  const summary = document.createElement("div");
  summary.className = "meter-summary";
  for (const [label, value] of [
    [t("totalPower"), fmtWatts(Number(totals?.powerW))],
    [
      t("sessionEnergy"),
      energy && Number.isFinite(Number(totals?.sessionWh)) ? fmtEnergy(Number(totals.sessionWh)) : "—",
    ],
    [t("portsLabel"), `${portCount}`],
    [t("deviceCount"), `${devices.length}`],
  ]) {
    const cell = document.createElement("div");
    cell.className = "meter-summary-item";
    const key = document.createElement("span");
    key.className = "meter-summary-label";
    key.textContent = label;
    const val = document.createElement("b");
    val.className = "meter-summary-value";
    val.textContent = value;
    cell.append(key, val);
    summary.append(cell);
  }
  dom.meterWrap.append(summary);

  const protocolCounts = new Map();
  for (const device of devices) {
    for (const port of device.ports || []) {
      if (!port.attached) continue;
      const label = protocolLabel(port);
      if (!label || label === "—") continue;
      protocolCounts.set(label, (protocolCounts.get(label) || 0) + 1);
    }
  }
  if (protocolCounts.size) {
    const strip = document.createElement("div");
    strip.className = "meter-protocol-strip";
    for (const [label, count] of [...protocolCounts.entries()].slice(0, 6)) {
      const chip = document.createElement("span");
      chip.className = "meter-protocol-chip";
      chip.textContent = `${label} ×${count}`;
      strip.append(chip);
    }
    dom.meterWrap.append(strip);
  }

  for (const device of devices) {
    const group = document.createElement("section");
    group.className = "meter-device";
    if (state.multi) {
      const head = document.createElement("div");
      head.className = "meter-device-head";
      const label = document.createElement("span");
      label.className = "meter-device-label";
      label.textContent = deviceLabel(device);
      const name = document.createElement("span");
      name.className = "meter-device-name";
      name.textContent = deviceName(device);
      const total = document.createElement("span");
      total.className = "meter-device-total";
      total.textContent = `${fmtWatts(Number(device.totals?.powerW))} · ${t("groupCharging", {
        n: Number(device.totals?.chargingCount) || 0,
      })}`;
      head.append(label, name, total);
      group.append(head);
    }

    const grid = document.createElement("div");
    grid.className = "meter-grid";
    for (const portId of PORT_IDS) {
      const port = findPort(device, portId);
      const globalId = globalIdFor(device, portId);
      const power = Number(port?.powerW) || 0;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "meter-card";
      card.style.setProperty("--pc", portColor(portId));
      card.setAttribute(
        "aria-label",
        `${state.multi ? `${deviceLabel(device)} ` : ""}${port?.name || portName(portId)} ${fmtWatts(power)} ${protocolLabel(port)}`,
      );
      card.addEventListener("click", () => openDetail(globalId));

      const head = document.createElement("div");
      head.className = "meter-card-head";
      const name = document.createElement("span");
      name.className = "meter-port";
      name.textContent = port?.name || portName(portId);
      const gid = document.createElement("span");
      gid.className = "meter-gid";
      gid.textContent = `P${globalId}`;
      head.append(name, gid);

      const proto = document.createElement("span");
      proto.className = "meter-proto";
      proto.textContent = protocolLabel(port);

      const metrics = document.createElement("div");
      metrics.className = "meter-metrics";
      metrics.append(
        meterMetric(t("voltage"), fmtVolts(Number(port?.voltageMv))),
        meterMetric(t("current"), fmtAmps(Number(port?.currentMa))),
        meterMetric(t("power"), fmtWatts(power)),
        meterMetric(
          t("sessionEnergy"),
          energy && Number.isFinite(Number(port?.sessionWh))
            ? fmtEnergy(Number(port.sessionWh))
            : "—",
        ),
      );

      const foot = document.createElement("div");
      foot.className = "meter-foot";
      const stateNode = document.createElement("span");
      stateNode.className = "meter-state";
      stateNode.dataset.tone = stateTone(port);
      stateNode.textContent = stateText(port);
      const time = document.createElement("span");
      time.className = "meter-time";
      time.textContent =
        energy && port?.attached ? fmtDuration(Number(port?.chargingSeconds)) : "—";
      foot.append(stateNode, time);

      const canvas = document.createElement("canvas");
      canvas.className = "meter-spark";
      canvas.setAttribute("aria-hidden", "true");
      card.append(head, proto, metrics, foot, canvas);
      grid.append(card);

      window.requestAnimationFrame(() => {
        const series = storeForDevice(device).series().find((item) => item.id === portId);
        drawSparkline(canvas, series?.samples || [], portColor(portId));
      });
    }
    group.append(grid);
    dom.meterWrap.append(group);
  }
}

/* ------------------------------------------------------------------ */
/* MOU TAI KE-inspired view (legacy internal id: cuktech)             */
/* ------------------------------------------------------------------ */

function ckRing(total, budget) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("class", "ck-ring");
  svg.setAttribute("role", "img");
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const pct = budget > 0 ? Math.max(0, Math.min(1, total / budget)) : 0;

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  bg.setAttribute("cx", "60");
  bg.setAttribute("cy", "60");
  bg.setAttribute("r", String(radius));
  bg.setAttribute("class", "ck-ring-bg");

  const value = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  value.setAttribute("cx", "60");
  value.setAttribute("cy", "60");
  value.setAttribute("r", String(radius));
  value.setAttribute("class", "ck-ring-value");
  value.setAttribute("stroke-dasharray", String(circumference));
  value.setAttribute("stroke-dashoffset", String(circumference * (1 - pct)));
  value.setAttribute("transform", "rotate(-90 60 60)");

  const num = document.createElementNS("http://www.w3.org/2000/svg", "text");
  num.setAttribute("x", "60");
  num.setAttribute("y", "62");
  num.setAttribute("text-anchor", "middle");
  num.setAttribute("class", "ck-ring-num");
  num.textContent = powerParts(total);
  const unit = document.createElementNS("http://www.w3.org/2000/svg", "text");
  unit.setAttribute("x", "60");
  unit.setAttribute("y", "80");
  unit.setAttribute("text-anchor", "middle");
  unit.setAttribute("class", "ck-ring-unit");
  unit.textContent = "W";
  svg.append(bg, value, num, unit);
  return svg;
}

function renderCuktech() {
  dom.cuktechWrap.replaceChildren();
  const devices = sortedDevices();
  if (devices.length === 0) return;
  const totals = aggregateTotals();
  const energy = energyAvailableAll();
  const budget = Number(totals?.budgetW) || 160 * devices.length;
  const total = Number(totals?.powerW) || 0;
  const vin = inputVoltageAverage();

  const hero = document.createElement("div");
  hero.className = "ck-hero";
  hero.append(ckRing(total, budget));
  const info = document.createElement("div");
  info.className = "ck-hero-info";
  const kicker = document.createElement("span");
  kicker.className = "ck-kicker";
  kicker.textContent = t("ckStyle");
  const title = document.createElement("b");
  title.className = "ck-title";
  title.textContent = t("totalPower");
  const stats = document.createElement("div");
  stats.className = "ck-stats";
  for (const [label, value] of [
    [
      t("sessionEnergy"),
      energy && Number.isFinite(Number(totals?.sessionWh)) ? fmtEnergy(Number(totals.sessionWh)) : "—",
    ],
    [t("deviceCount"), `${devices.length}`],
    [t("portsLabel"), `${Number(totals?.portCount) || 5 * devices.length}`],
    [
      t("inputVoltage"),
      Number(vin) > 0 ? `${Number(vin).toFixed(2)} V` : "—",
    ],
  ]) {
    const cell = document.createElement("div");
    cell.className = "ck-stat";
    const k = document.createElement("span");
    k.textContent = label;
    const v = document.createElement("b");
    v.textContent = value;
    cell.append(k, v);
    stats.append(cell);
  }
  info.append(kicker, title, stats);
  hero.append(info);
  dom.cuktechWrap.append(hero);

  for (const device of devices) {
    const section = document.createElement("section");
    section.className = "ck-device";
    const head = document.createElement("div");
    head.className = "ck-device-head";
    const label = document.createElement("span");
    label.className = "ck-device-label";
    label.textContent = deviceLabel(device);
    const name = document.createElement("span");
    name.className = "ck-device-name";
    name.textContent = deviceName(device);
    const totalNode = document.createElement("span");
    totalNode.className = "ck-device-total";
    totalNode.textContent = fmtWatts(Number(device.totals?.powerW));
    head.append(label, name, totalNode);
    section.append(head);

    const grid = document.createElement("div");
    grid.className = "ck-ports";
    for (const portId of PORT_IDS) {
      const port = findPort(device, portId);
      const globalId = globalIdFor(device, portId);
      const power = Number(port?.powerW) || 0;
      const capability = portCapability(device, portId);
      const pct = capability > 0 ? Math.max(0, Math.min(100, (power / capability) * 100)) : 0;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ck-port";
      card.style.setProperty("--pc", portColor(portId));
      card.setAttribute(
        "aria-label",
        `${state.multi ? `${deviceLabel(device)} ` : ""}${port?.name || portName(portId)} ${fmtWatts(power)} ${protocolLabel(port)}`,
      );
      card.addEventListener("click", () => openDetail(globalId));

      const top = document.createElement("div");
      top.className = "ck-port-top";
      const portName = document.createElement("span");
      portName.className = "ck-port-name";
      portName.textContent = port?.name || portName(portId);
      const proto = document.createElement("span");
      proto.className = "ck-proto";
      proto.textContent = protocolLabel(port);
      top.append(portName, proto);

      const big = document.createElement("div");
      big.className = "ck-power";
      big.textContent = powerParts(power);
      const unit = document.createElement("span");
      unit.textContent = " W";
      big.append(unit);

      const meta = document.createElement("div");
      meta.className = "ck-meta";
      meta.textContent = `${fmtVolts(Number(port?.voltageMv))} · ${fmtAmps(Number(port?.currentMa))}`;

      const bar = document.createElement("div");
      bar.className = "ck-bar";
      const fill = document.createElement("span");
      fill.style.width = `${pct}%`;
      bar.append(fill);

      const foot = document.createElement("div");
      foot.className = "ck-foot";
      const stateNode = document.createElement("span");
      stateNode.textContent = stateText(port);
      const wh = document.createElement("span");
      wh.textContent =
        energy && Number.isFinite(Number(port?.sessionWh))
          ? fmtEnergy(Number(port.sessionWh))
          : "—";
      foot.append(stateNode, wh);

      card.append(top, big, meta, bar, foot);
      grid.append(card);
    }
    section.append(grid);
    dom.cuktechWrap.append(section);
  }
}

/* ------------------------------------------------------------------ */
/* Pro view diagrams                                                  */
/* ------------------------------------------------------------------ */

function destroyDiagrams() {
  for (const entry of state.diagrams.values()) entry.diagram.destroy();
  state.diagrams.clear();
  state.diagramSignature = "";
  dom.diagramWrap.replaceChildren();
}

function ensureDiagrams() {
  const devices = sortedDevices();
  const signature = `${state.multi ? "m" : "s"}|${devices
    .map((device) => `${device.index}:${device.host || ""}`)
    .join("|")}`;
  if (signature === state.diagramSignature && state.diagrams.size === devices.length) return;
  destroyDiagrams();
  state.diagramSignature = signature;

  const grid = document.createElement("div");
  grid.className = `diagram-grid${state.multi ? "" : " is-single"}`;

  for (const device of devices) {
    const card = document.createElement("div");
    card.className = "device-diagram";

    let total = null;
    if (state.multi) {
      const head = document.createElement("div");
      head.className = "device-diagram-head";
      const label = document.createElement("span");
      label.className = "dd-label";
      label.textContent = deviceLabel(device);
      const name = document.createElement("span");
      name.className = "dd-name";
      name.textContent = deviceName(device);
      total = document.createElement("span");
      total.className = "dd-total";
      head.append(label, name, total);
      card.append(head);
    }

    const canvas = document.createElement("div");
    canvas.className = "device-diagram-canvas";
    card.append(canvas);
    grid.append(card);

    const index = Number(device.index);
    const diagram = createDiagram(canvas, {
      monochrome: true,
      onSelect: (portId) => openDetail(globalIdFor(device, portId)),
      describe: (port, id) =>
        `${state.multi ? `${deviceLabel(device)} ` : ""}${t("portAria", {
          name: port?.name || portName(id),
          power: port ? fmtWatts(Number(port.powerW)) : "—",
          state: stateText(port),
        })}`,
    });
    state.diagrams.set(index, { diagram, card, total });
  }
  dom.diagramWrap.append(grid);
}

function renderDiagrams() {
  ensureDiagrams();
  for (const device of sortedDevices()) {
    const entry = state.diagrams.get(Number(device.index));
    if (!entry) continue;
    const selectedPortId =
      state.selectedPort && Number(state.selectedPort.deviceIndex) === Number(device.index)
        ? Number(state.selectedPort.portId)
        : null;
    entry.diagram.update(device, { selected: selectedPortId });
    if (entry.total) {
      entry.total.textContent = `${fmtWatts(Number(device.totals?.powerW))} · ${t("groupCharging", {
        n: Number(device.totals?.chargingCount) || 0,
      })}`;
    }
  }
}

function replayFlow() {
  for (const entry of state.diagrams.values()) entry.diagram.replay();
}

/* ------------------------------------------------------------------ */
/* Flow view (pro / simple)                                           */
/* ------------------------------------------------------------------ */

function setView(view) {
  if (!["pro", "simple", "meter", "cuktech"].includes(view)) return;
  state.view = view;
  saveSettings({ view });
  state.settings = effectiveSettings();
  renderFlow();
}

function renderFlow() {
  const view = state.view;
  const pro = view === "pro";
  const simple = view === "simple";
  const meter = view === "meter";
  const cuktech = view === "cuktech";
  dom.replayBtn.hidden = !pro;
  dom.diagramWrap.hidden = !pro;
  dom.simpleWrap.hidden = !simple;
  dom.meterWrap.hidden = !meter;
  dom.cuktechWrap.hidden = !cuktech;
  const subKey = pro
    ? "flowSub"
    : simple
      ? "flowSubSimple"
      : meter
        ? "flowSubMeter"
        : "flowSubCuktech";
  dom.flowSub.textContent = t(subKey);
  for (const button of dom.viewTabs.querySelectorAll(".seg-btn")) {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
  }
  if (pro) renderDiagrams();
  else destroyDiagrams();
  if (simple) renderSimple();
  if (meter) renderMeter();
  if (cuktech) renderCuktech();
}

/* ------------------------------------------------------------------ */
/* System strip                                                       */
/* ------------------------------------------------------------------ */

function sysGroup(title, rows) {
  const group = document.createElement("section");
  group.className = "sys-group";
  const heading = document.createElement("h3");
  heading.className = "sys-group-title";
  heading.textContent = title;
  const list = document.createElement("dl");
  list.className = "sys-rows";
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "sys-row";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value === undefined || value === null || value === "" ? "—" : String(value);
    row.append(dt, dd);
    list.append(row);
  }
  group.append(heading, list);
  return group;
}

function renderSystem() {
  const primary = primaryDevice();
  const device = primary?.device || {};
  const system = primary?.system || {};
  const wifi = primary?.wifi || {};
  const source = primary?.source || "";
  const energyAvailable = energyAvailableAll();
  const isProm =
    state.devices.some((item) => item.source === "prometheus" || item.capabilities?.prometheus === true);

  dom.sourceBadge.textContent = primary
    ? state.multi
      ? t("multiBadge", { n: state.devices.length })
      : sourceLabel(source)
    : "—";
  dom.sourceBadge.dataset.source = state.multi ? "multi" : source || "";
  dom.promNote.hidden = !primary || (!isProm && energyAvailable);

  const groups = [];
  if (state.multi && state.devices.length) {
    groups.push(
      sysGroup(
        t("systemMultiDevices"),
        state.devices.map((item) => [
          deviceLabel(item),
          `${deviceName(item)} · ${fmtWatts(Number(item.totals?.powerW))} · ${t("online")}`,
        ]),
      ),
    );
  }

  if (primary) {
    groups.push(
      sysGroup(t("sysDevice"), [
        [t("labelPsn"), state.demo ? device.psn || "—" : maskPsn(device.psn)],
        [
          t("labelModel"),
          typeof device.modelLabel === "string" && device.modelLabel.trim()
            ? device.modelLabel.replace(/（[^）]*）|\([^)]*\)/g, "").trim() || device.modelLabel
            : device.model,
        ],
        [t("labelColor"), device.color],
        [t("labelHw"), device.hwRev],
        [t("labelHost"), primary.host || hostForRequests() || "—"],
      ]),
      sysGroup(t("sysFirmware"), [
        [t("labelApp"), system.appVersion || device.esp32Version],
        [t("labelEsp32"), device.esp32Version],
        [t("labelMcu"), device.mcuVersion],
        [t("labelFpga"), device.fpgaVersion],
        [t("labelZrlib"), device.zrlibVersion],
      ]),
      sysGroup(t("sysSystem"), [
        [t("labelChip"), system.chip],
        [t("labelCores"), system.cores],
        [t("labelCpu"), Number.isFinite(system.cpuFreqMhz) ? `${system.cpuFreqMhz} MHz` : "—"],
        [t("labelIdf"), system.idfVersion],
        [t("labelFreeHeap"), fmtBytes(Number(system.freeHeap))],
        [t("labelReset"), system.resetReasonLabel || system.resetReason],
        [t("uptime"), fmtUptime(Number(system.uptimeSeconds))],
      ]),
      sysGroup(t("sysWifi"), [
        [t("labelSsid"), wifi.ssid],
        [t("labelRssi"), fmtRssi(Number(wifi.rssi))],
        [t("labelChannel"), wifi.channel],
        [t("labelBssid"), maskMac(wifi.bssid)],
        [t("labelLatency"), Number.isFinite(state.aggregate?.latencyMs) ? `${state.aggregate.latencyMs} ms` : "—"],
        [t("labelUpdated"), fmtClock(state.aggregate?.fetchedAt || primary.fetchedAt)],
      ]),
      sysGroup(t("sysSource"), [
        [t("sysSource"), sourceLabel(source)],
        [t("labelHost"), primary.host || hostForRequests() || "—"],
        [t("portsLabel"), `${state.devices.reduce((sum, item) => sum + (item.ports?.length || 5), 0)} 口`],
        [t("deviceCount"), `${state.devices.length} / ${totalDeviceCount()}`],
        [t("labelUpdated"), fmtDateTime(state.aggregate?.fetchedAt || primary.fetchedAt)],
      ]),
    );
  }
  dom.sysGrid.replaceChildren(...groups);
}

/* ------------------------------------------------------------------ */
/* Chart                                                              */
/* ------------------------------------------------------------------ */

function computeTotal(seriesList) {
  const normalized = (seriesList || []).map((series) => ({
    ...series,
    samples: (series.samples || [])
      .slice()
      .sort((a, b) => a.t - b.t),
  }));
  const times = new Set();
  for (const series of normalized) {
    for (const sample of series.samples) {
      if (Number.isFinite(sample.t)) times.add(sample.t);
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const cursors = normalized.map(() => 0);
  const maxGap = 90000;
  const result = [];
  for (const t of sorted) {
    let sum = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      const samples = normalized[i].samples;
      while (cursors[i] + 1 < samples.length && samples[cursors[i] + 1].t <= t) cursors[i] += 1;
      const sample = samples[cursors[i]];
      if (sample && sample.t <= t && t - sample.t <= maxGap) sum += Number(sample.powerW) || 0;
    }
    result.push({ t, powerW: Math.round(sum * 1000) / 1000 });
  }
  return result;
}

function buildChartData() {
  if (state.multi) {
    const lines = [];
    const deviceTotals = [];
    for (const device of sortedDevices()) {
      const store = state.stores.get(deviceKey(device));
      const series = store?.series() || [];
      const total = computeTotal(series);
      lines.push({
        id: `dev${device.index}`,
        name: t("chartLegendDevice", { n: Number(device.index) + 1 }),
        color: chartDeviceColor(device.index),
        samples: total,
      });
      deviceTotals.push({ samples: total });
    }
    return { lines, total: computeTotal(deviceTotals) };
  }

  const store = primaryStore();
  const series = store?.series() || [];
  const lines = series.map((port) => ({
    id: String(port.id),
    name: port.name || portName(port.id),
    color: chartPortColor(port.id),
    samples: port.samples || [],
  }));
  return { lines, total: computeTotal(series) };
}

function visibleSeriesIds() {
  return state.chartLineIds.filter((id) => !state.hidden.has(id));
}

function buildLegend() {
  const items = [
    { id: "total", label: t("chartTotal"), color: cssVar("--chart-total", "#b45309") },
    ...state.chartSeriesMeta,
  ];
  const signature = items.map((item) => `${item.id}:${item.label}:${item.color}`).join("|");
  if (signature === state.legendSignature) return;
  state.legendSignature = signature;
  dom.chartLegend.replaceChildren();

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "legend-btn";
    button.dataset.series = item.id;
    button.setAttribute("aria-pressed", String(!state.hidden.has(item.id)));
    button.setAttribute("aria-label", t("legendAria", { name: item.label }));

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.setProperty("--c", item.color);
    const label = document.createElement("span");
    label.textContent = item.label;
    button.append(dot, label);

    button.addEventListener("click", () => {
      if (state.hidden.has(item.id)) state.hidden.delete(item.id);
      else state.hidden.add(item.id);
      button.setAttribute("aria-pressed", String(!state.hidden.has(item.id)));
      state.chart?.setVisible(visibleSeriesIds());
    });

    dom.chartLegend.append(button);
  }
}

function refreshChart() {
  if (!state.chart) return;
  const { lines, total } = buildChartData();
  state.chartSeriesMeta = lines.map((line) => ({ id: line.id, label: line.name, color: line.color }));
  state.chartLineIds = ["total", ...lines.map((line) => line.id)];
  buildLegend();
  state.chart.setLabels({ total: t("chartTotal") });
  state.chart.setData({
    ports: lines,
    total,
    rangeMs: RANGES[state.range] || RANGES["30m"],
    now: Date.now(),
    visible: visibleSeriesIds(),
  });

  state.chartHasData = total.length > 0;
  const spinner = dom.chartOverlay.querySelector(".spinner");
  dom.chartOverlay.hidden = state.chartHasData;
  if (spinner) spinner.hidden = !state.loading;
  dom.chartOverlayText.textContent = state.loading ? t("chartLoading") : t("chartEmpty");
  dom.chartSub.textContent = t(RANGE_SUB[state.range] || "chartSub30m");
  dom.chart.setAttribute("aria-label", t("chartTitle"));
  for (const button of dom.rangeTabs.querySelectorAll(".seg-btn")) {
    button.setAttribute("aria-pressed", String(button.dataset.range === state.range));
  }
}

function setRange(range) {
  if (!RANGES[range]) return;
  state.range = range;
  saveSettings({ window: range });
  state.settings = effectiveSettings();
  refreshChart();
}

/* ------------------------------------------------------------------ */
/* Port detail                                                        */
/* ------------------------------------------------------------------ */

function detailItem(label, value, { unavailable = false, title = "" } = {}) {
  const item = document.createElement("div");
  item.className = "detail-item";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  if (unavailable) dd.classList.add("is-unavailable");
  if (title) dd.title = title;
  item.append(dt, dd);
  return item;
}

function updateDetail() {
  if (!state.detailOpen || !state.selectedPort) return;
  const resolved = resolvePort(state.selectedPort.globalId);
  if (!resolved) {
    dom.detailTitle.textContent = "—";
    dom.detailDevice.textContent = "";
    return;
  }
  const { device, port } = resolved;
  const portId = Number(port.id);
  const energyAvailable = device.capabilities?.energy !== false;
  const color = portColor(portId);

  dom.detailTitle.textContent = port?.name || portName(portId);
  dom.detailDevice.textContent = state.multi
    ? `${deviceLabel(device)} · ${deviceName(device)} · ${device.host || ""}`
    : deviceName(device);
  dom.detailDot.style.setProperty("--pc", color);
  dom.detailState.textContent = stateText(port);
  dom.detailState.dataset.tone = stateTone(port);
  dom.detailW.textContent = port ? powerParts(Number(port.powerW)) : "—";
  dom.detailProto.textContent = port ? protocolLabel(port) : "—";
  dom.detailProto.style.setProperty("--pc", color);

  const deviceMax = Number(device.device?.portMaxW?.[portId]);
  const portBudget = Number(port?.powerBudgetW);
  const limit = Math.max(Number.isFinite(deviceMax) ? deviceMax : 0, Number.isFinite(portBudget) ? portBudget : 0);

  const items = [
    detailItem(t("voltage"), port?.attached ? fmtVolts(Number(port.voltageMv)) : "—"),
    detailItem(t("current"), port?.attached ? fmtAmps(Number(port.currentMa)) : "—"),
    detailItem(
      energyAvailable ? `${t("sessionEnergy")} · ${t("estimated")}` : t("sessionEnergy"),
      energyAvailable && port?.attached ? `≈ ${fmtEnergy(Number(port.sessionWh))}` : "—",
      { unavailable: !energyAvailable || !port?.attached, title: energyAvailable ? t("energyTip") : t("energyUnavailable") },
    ),
    detailItem(
      t("chargeTime"),
      energyAvailable && port?.attached ? fmtDuration(Number(port.chargingSeconds)) : "—",
      { unavailable: !energyAvailable || !port?.attached, title: energyAvailable ? "" : t("energyUnavailable") },
    ),
    detailItem(t("portLimit"), limit > 0 ? `${limit} W` : "—", { title: t("portLimit") }),
    detailItem(t("firmwareState"), port?.state ? String(port.state) : "—", { title: t("firmwareState") }),
  ];
  dom.detailGrid.replaceChildren(...items);

  const store = state.stores.get(deviceKey(device));
  const series = store?.series().find((entry) => entry.id === portId);
  const samples = (series?.samples || []).filter((sample) => sample.t >= Date.now() - 30 * 60 * 1000);
  const peak = samples.reduce((max, sample) => Math.max(max, Number(sample.powerW) || 0), 0);
  dom.detailSparkMeta.textContent = samples.length
    ? t("sparkMeta", { count: samples.length, peak: fmtWatts(peak) })
    : t("noHistory");
  if (dom.detailSpark.offsetParent !== null) {
    drawSparkline(dom.detailSpark, samples, color, { maxGapMs: 90000 });
  }
}

function openDetail(globalId) {
  const resolved = resolvePort(globalId);
  if (!resolved) return;
  const key = Number(globalId);
  if (state.detailOpen && state.selectedPort?.globalId === key) return;
  const { device, port } = resolved;
  state.selectedPort = { globalId: key, deviceIndex: Number(device.index), portId: Number(port.id) };
  state.detailOpen = true;
  state.detailReturnFocus = document.activeElement;
  updateDetail();
  renderDiagrams();
  renderPorts();

  dom.detailLayer.hidden = false;
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => {
    dom.detailLayer.classList.add("is-open");
    dom.detailClose.focus({ preventScroll: true });
    updateDetail();
  });
}

function closeDetail() {
  if (!state.detailOpen) return;
  state.detailOpen = false;
  dom.detailLayer.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const delay = reduce ? 0 : 280;
  window.setTimeout(() => {
    if (state.detailOpen) return;
    dom.detailLayer.hidden = true;
    state.selectedPort = null;
    renderDiagrams();
    renderPorts();
    const focusTarget = state.detailReturnFocus;
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus({ preventScroll: true });
    }
  }, delay);
}

function onSheetKeydown(event) {
  if (!state.detailOpen) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeDetail();
    return;
  }
  if (event.key !== "Tab") return;
  const focusables = dom.detailSheet.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ------------------------------------------------------------------ */
/* Device dialog                                                      */
/* ------------------------------------------------------------------ */

function deviceDialogVisibleList() {
  if (state.demo) {
    return state.devices.map((device) => ({
      host: device.host,
      name: deviceName(device),
      psn: device.device?.psn || "",
      model: device.device?.model || "",
      modelLabel: device.device?.modelLabel || "",
      lastSeen: device.fetchedAt,
      demo: true,
      index: device.index,
    }));
  }
  return savedDevices();
}

function renderDeviceDialog() {
  const demo = state.demo;
  const multi = state.deviceDialogMode === "multi";
  for (const button of dom.deviceModeTabs.querySelectorAll(".seg-btn")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.deviceDialogMode));
  }
  const list = deviceDialogVisibleList();
  const headingKey = demo ? "demoDevicesHeading" : "savedDevices";
  dom.savedSectionTitle.dataset.i18n = headingKey;
  dom.savedSectionTitle.textContent = t(headingKey);
  dom.deviceModeHint.textContent = multi
    ? t("multiHint")
    : savedDevices().length < 2 && !demo
      ? t("multiDisabled")
      : "";
  dom.savedCount.textContent = demo ? t("demoBadge") : `${list.length}`;
  dom.deviceApplyMulti.hidden = demo || !multi;
  dom.deviceApplyMulti.disabled = state.multiDraft.size < 2;
  dom.savedDeviceList.replaceChildren();

  if (list.length === 0) {
    const empty = document.createElement("li");
    empty.className = "device-empty";
    empty.textContent = t("noSavedDevices");
    dom.savedDeviceList.append(empty);
  }

  const activeHost = state.settings?.host || "";
  const multiHosts = new Set(state.multiDraft);

  for (const device of list) {
    const row = document.createElement("li");
    row.className = "device-row";
    if (activeHost === device.host) row.classList.add("is-active");

    const checkboxId = `dev-${String(device.host).replace(/[^a-z0-9]/gi, "-")}`;
    if (multi && !demo) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = checkboxId;
      checkbox.checked = multiHosts.has(device.host);
      checkbox.setAttribute("aria-label", device.name || device.host);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.multiDraft.add(device.host);
        else state.multiDraft.delete(device.host);
        dom.deviceApplyMulti.disabled = state.multiDraft.size < 2;
      });
      row.append(checkbox);
    }

    const main = document.createElement("div");
    main.className = "device-row-main";
    const name = document.createElement("p");
    name.className = "device-name";
    name.textContent = device.name || device.host;
    if (device.model === "pro" || device.model === "ultra") {
      const tier = document.createElement("span");
      tier.className = `device-tier is-${device.model}`;
      tier.textContent = device.model === "ultra" ? "Ultra" : "Pro";
      name.append(tier);
    }
    if (demo) {
      const badge = document.createElement("span");
      badge.className = "device-demo-badge";
      badge.textContent = t("demoBadge");
      name.append(badge);
    }
    const meta = document.createElement("p");
    meta.className = "device-meta";
    meta.textContent = [
      device.host,
      device.psn ? `PSN ${state.demo ? device.psn : maskPsn(device.psn)}` : "",
      Number.isFinite(device.lastSeen) ? `${t("lastSeen")} ${fmtClock(device.lastSeen)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    main.append(name, meta);
    row.append(main);

    if (demo) {
      const real = document.createElement("a");
      real.className = "btn btn-soft btn-sm device-real";
      real.href = urlForRealMode();
      real.textContent = t("realDeviceShort");
      real.title = t("useRealDevice");
      row.append(real);
    } else {
      const use = document.createElement("button");
      use.type = "button";
      use.className = "btn btn-soft btn-sm";
      const isCurrent = !multi && activeHost === device.host;
      use.textContent = isCurrent ? t("selectedDevice") : t("selectDevice");
      use.disabled = isCurrent;
      use.addEventListener("click", () => {
        setActiveDevice(device.host);
        state.settings = effectiveSettings();
        closeDeviceDialog();
        reinitializeData();
      });
      row.append(use);
    }

    if (!demo) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.setAttribute("aria-label", `${t("removeDevice")} ${device.name || device.host}`);
      remove.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/></svg>';
      remove.addEventListener("click", () => {
        removeDevice(device.host);
        state.settings = effectiveSettings();
        state.multiDraft.delete(device.host);
        renderDeviceDialog();
        reinitializeData();
      });
      row.append(remove);
    }

    dom.savedDeviceList.append(row);
  }

  // Scan results
  dom.deviceScanBtn.disabled = state.deviceScan.scanning;
  dom.deviceScanBtn.textContent = state.deviceScan.scanning ? t("scanning") : t("scanLan");
  dom.deviceScanStatus.textContent = state.deviceScan.statusKey
    ? t(state.deviceScan.statusKey, state.deviceScan.statusVars || undefined)
    : "";
  dom.deviceScanList.replaceChildren();
  for (const device of state.deviceScan.results) {
    const known = savedDevices().some(
      (item) =>
        item.host === (device.host || device.ip) ||
        (device.psn && item.psn === device.psn),
    );
    const item = document.createElement("li");
    item.className = "scan-item";
    const text = document.createElement("div");
    text.className = "scan-item-text";
    const name = document.createElement("p");
    name.className = "scan-name";
    name.textContent = device.name || device.host || device.ip || "—";
    const meta = document.createElement("p");
    meta.className = "scan-meta";
    meta.textContent = [
      device.host || device.ip,
      device.psn ? `PSN ${maskPsn(device.psn)}` : "",
      Number.isFinite(Number(device.rssi)) ? fmtRssi(Number(device.rssi)) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    text.append(name, meta);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-soft btn-sm";
    add.textContent = known ? t("selectedDevice") : t("add");
    add.disabled = known;
    add.addEventListener("click", () => addDeviceEntry(device, { use: savedDevices().length === 0 }));
    item.append(text, add);
    dom.deviceScanList.append(item);
  }

  dom.demoOneLink.href = urlWithDemo(1);
  dom.demoTwoLink.href = urlWithDemo(2);
}

function openDeviceDialog() {
  state.deviceDialogMode = state.demo
    ? state.devices.length > 1
      ? "multi"
      : "single"
    : state.settings.multi
      ? "multi"
      : "single";
  state.multiDraft = new Set(state.settings.multiHosts || []);
  state.deviceScan = { scanning: false, results: [], statusKey: "", error: null };
  renderDeviceDialog();
  if (typeof dom.deviceDialog.showModal === "function") {
    if (!dom.deviceDialog.open) dom.deviceDialog.showModal();
  } else {
    dom.deviceDialog.setAttribute("open", "");
  }
}

function closeDeviceDialog() {
  if (typeof dom.deviceDialog.close === "function" && dom.deviceDialog.open) dom.deviceDialog.close();
  else dom.deviceDialog.removeAttribute("open");
}

async function startDeviceScan() {
  if (state.deviceScan.scanning) return;
  state.deviceScan.scanning = true;
  state.deviceScan.statusKey = "discoveryScanning";
  renderDeviceDialog();
  try {
    const result = await scanLan();
    state.deviceScan.results = Array.isArray(result?.devices) ? result.devices : [];
    state.deviceScan.statusKey = state.deviceScan.results.length ? "discoveryFound" : "discoveryEmpty";
    state.deviceScan.statusVars = { n: state.deviceScan.results.length };
    state.deviceScan.error = null;
  } catch (error) {
    state.deviceScan.results = [];
    state.deviceScan.statusKey = isProxyError(error) ? "scanProxyMissing" : "discoveryError";
    state.deviceScan.error = error;
  } finally {
    state.deviceScan.scanning = false;
    renderDeviceDialog();
  }
}

function addManualDevice(input, { use = false } = {}) {
  const host = input.value.trim();
  if (!host) return;
  upsertDevice({ host, lastSeen: Date.now() });
  state.settings = effectiveSettings();
  input.value = "";
  renderDeviceDialog();
  if (use && !state.lastGood) {
    setActiveDevice(host);
    state.settings = effectiveSettings();
    closeDeviceDialog();
    reinitializeData();
  }
}

/* ------------------------------------------------------------------ */
/* Settings dialog                                                    */
/* ------------------------------------------------------------------ */

function closestIntervalOption(value) {
  const options = [...dom.setInterval.options].map((option) => Number(option.value));
  if (options.includes(value)) return String(value);
  let best = options[0];
  for (const option of options) {
    if (Math.abs(option - value) < Math.abs(best - value)) best = option;
  }
  return String(best);
}

function populateSettingsForm() {
  const settings = effectiveSettings();
  const url = getUrlOverrides();
  dom.setHost.value = url.host || settings.host || "";
  dom.setMode.value = settings.mode || "auto";
  dom.setInterval.value = closestIntervalOption(Number(settings.intervalMs) || 3000);
  dom.setTheme.value = settings.theme || "auto";
  dom.setLang.value = settings.lang || "zh";
  dom.urlHostNote.hidden = !url.host;
  dom.testStatus.textContent = "";
  dom.testStatus.removeAttribute("data-tone");
  dom.setupHint.hidden = true;
  dom.scanPanel.hidden = true;
  dom.scanList.replaceChildren();
  dom.scanCount.textContent = "";
}

function openSettings() {
  populateSettingsForm();
  if (typeof dom.settingsDialog.showModal === "function") {
    if (!dom.settingsDialog.open) dom.settingsDialog.showModal();
  } else {
    dom.settingsDialog.setAttribute("open", "");
  }
}

function closeSettings() {
  if (typeof dom.settingsDialog.close === "function" && dom.settingsDialog.open) {
    dom.settingsDialog.close();
  } else {
    dom.settingsDialog.removeAttribute("open");
  }
}

function setTestStatus(message, tone) {
  dom.testStatus.textContent = message;
  if (tone) dom.testStatus.dataset.tone = tone;
  else dom.testStatus.removeAttribute("data-tone");
}

async function testConnection() {
  const host = dom.setHost.value.trim();
  const mode = dom.setMode.value;
  dom.testBtn.disabled = true;
  setTestStatus(t("testing"), "pending");
  try {
    await probeProxy();
  } catch {
    setTestStatus(t("testProxyMissing"), "bad");
    dom.testBtn.disabled = false;
    return;
  }
  try {
    const snapshot = await getSnapshot({ host: host || undefined, mode });
    const power = Number(snapshot?.totals?.powerW);
    setTestStatus(
      t("testOk", {
        source: sourceLabel(snapshot?.source),
        ms: Number.isFinite(snapshot?.latencyMs) ? snapshot.latencyMs : 0,
        power: Number.isFinite(power) ? fmtWatts(power) : "—",
      }),
      "ok",
    );
  } catch (error) {
    if (error?.code === "NO_DEVICE") {
      setTestStatus(t("testNoDevice"), "warn");
      dom.setupHint.hidden = false;
    } else {
      setTestStatus(error?.message || t("offlineNoData"), "bad");
    }
  } finally {
    dom.testBtn.disabled = false;
  }
}

async function startScan() {
  if (dom.scanBtn.disabled) return;
  dom.scanBtn.disabled = true;
  const original = dom.scanBtn.textContent;
  dom.scanBtn.textContent = t("scanning");
  dom.scanPanel.hidden = false;
  dom.scanList.replaceChildren();
  dom.scanCount.textContent = "";
  try {
    const result = await scanLan();
    const devices = Array.isArray(result?.devices) ? result.devices : [];
    const subnets = Array.isArray(result?.subnets) ? result.subnets : [];
    dom.scanCount.textContent = t("scanSubnets", { n: subnets.length || 0 });

    if (devices.length === 0) {
      const item = document.createElement("li");
      item.className = "scan-item";
      item.textContent = t("scanEmpty");
      dom.scanList.append(item);
    } else {
      for (const device of devices) {
        const item = document.createElement("li");
        item.className = "scan-item";
        const text = document.createElement("div");
        text.className = "scan-item-text";
        const name = document.createElement("p");
        name.className = "scan-name";
        name.textContent = device.name || device.host || device.ip || "—";
        const meta = document.createElement("p");
        meta.className = "scan-meta";
        meta.textContent = [
          device.host || device.ip,
          device.psn ? `PSN ${maskPsn(device.psn)}` : "",
          Number.isFinite(Number(device.rssi)) ? fmtRssi(Number(device.rssi)) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        text.append(name, meta);
        const use = document.createElement("button");
        use.type = "button";
        use.className = "btn btn-soft";
        use.textContent = t("scanPick");
        use.addEventListener("click", () => {
          dom.setHost.value = device.host || device.ip || "";
          dom.setHost.focus();
        });
        item.append(text, use);
        dom.scanList.append(item);
      }
    }
  } catch (error) {
    const item = document.createElement("li");
    item.className = "scan-item";
    item.textContent = isProxyError(error) ? t("scanProxyMissing") : error?.message || t("scanEmpty");
    dom.scanList.append(item);
  } finally {
    dom.scanBtn.disabled = false;
    dom.scanBtn.textContent = original || t("scanLan");
  }
}

/* ------------------------------------------------------------------ */
/* Language / settings actions                                        */
/* ------------------------------------------------------------------ */

function applyLanguage(language, { persist = true } = {}) {
  if (persist) saveSettings({ lang: language });
  state.settings = effectiveSettings();
  setLang(state.settings.lang);
  applyI18n(document);
  updateStaticTranslations();
  for (const entry of state.diagrams.values()) entry.diagram.refreshLabels();
  state.legendSignature = "";
  renderAll();
}

function handleSave(event) {
  event.preventDefault();
  const previousHost = hostForRequests();
  const previousMode = modeForRequests();
  const previousMulti = Boolean(state.settings.multi);
  const previousHosts = (state.settings.multiHosts || []).join(",");
  const patch = {
    host: dom.setHost.value.trim(),
    mode: dom.setMode.value,
    intervalMs: Number(dom.setInterval.value) || 3000,
    theme: dom.setTheme.value,
    lang: dom.setLang.value,
    window: state.range,
    view: state.view,
  };
  saveSettings(patch);
  state.settings = effectiveSettings();
  state.demo = state.settings.demo;
  const needsReset =
    hostForRequests() !== previousHost ||
    modeForRequests() !== previousMode ||
    Boolean(state.settings.multi) !== previousMulti ||
    (state.settings.multiHosts || []).join(",") !== previousHosts;

  setLang(state.settings.lang);
  applyTheme(state.settings.theme);
  applyI18n(document);
  updateStaticTranslations();
  closeSettings();

  if (needsReset) {
    reinitializeData();
  } else {
    renderAll();
    restartPolling();
  }
}

function handleReset() {
  resetSettings();
  state.settings = effectiveSettings();
  state.demo = state.settings.demo;
  state.demoCount = state.settings.demoDevices || 1;
  setLang(state.settings.lang);
  applyTheme(state.settings.theme);
  applyI18n(document);
  updateStaticTranslations();
  populateSettingsForm();
  closeSettings();
  closeDeviceDialog();
  reinitializeData();
}

/* ------------------------------------------------------------------ */
/* Data flow                                                          */
/* ------------------------------------------------------------------ */

function normalizeDevice(raw, position) {
  const index = Number.isInteger(Number(raw?.index)) ? Number(raw.index) : position;
  const ports = (Array.isArray(raw?.ports) ? raw.ports : []).map((port) => ({
    ...port,
    deviceIndex: index,
    globalId: Number.isFinite(Number(port.globalId)) ? Number(port.globalId) : index * 5 + Number(port.id),
  }));
  return {
    ...raw,
    index,
    label: raw?.label || deviceLabel({ index }),
    ports,
    host: raw?.host || `slot-${index}`,
  };
}

function applyAggregate(payload) {
  const rawDevices = Array.isArray(payload?.devices) ? payload.devices : [];
  const devices = rawDevices.map((device, index) => normalizeDevice(device, index));
  const totals = payload?.totals || aggregateSnapshots(devices, Date.now()).totals;
  state.devices = devices;
  state.aggregate = {
    ...(payload || {}),
    devices,
    totals,
    errors: Array.isArray(payload?.errors) ? payload.errors : [],
    fetchedAt: Number(payload?.fetchedAt) || Date.now(),
  };
  state.multi = state.demo ? state.demoCount > 1 : isLiveMulti() || devices.length > 1;
  state.lastGood = state.aggregate;
  state.lastGoodAt = Date.now();
  state.lastError = null;
  state.lastErrorCode = "";
  state.loading = false;
  state.backoff = 0;

  for (const device of devices) storeForDevice(device).add(device);

  syncSavedDeviceMeta(devices);

  if (!state.historySeeded) {
    state.historySeeded = true;
    seedHistory();
  }

  updateStatus(deriveStatus());
  renderAll();
  announce();
}

async function fetchData() {
  if (state.demo) return demoMulti(state.demoCount);
  if (isLiveMulti()) {
    return getMulti({
      hosts: (state.settings.multiHosts || []).slice(0, MAX_DEVICES),
      mode: modeForRequests(),
    });
  }
  const snapshot = await getSnapshot({ host: hostForRequests() || undefined, mode: modeForRequests() });
  return aggregateSnapshots([snapshot], Number(snapshot?.fetchedAt) || Date.now());
}

function seedHistory() {
  const myGen = state.gen;
  if (state.demo) {
    const history = demoMultiHistoryFor(Date.now(), state.demoCount, 720);
    for (const entry of history.devices || []) {
      storeForHost(`demo-${Number(entry.index) + 1}.local`).merge(entry.history);
    }
    refreshChart();
    renderPorts();
    updateDetail();
    return;
  }

  if (isLiveMulti()) {
    getMultiHistory({ hosts: (state.settings.multiHosts || []).slice(0, MAX_DEVICES), limit: 180 })
      .then((history) => {
        if (myGen !== state.gen) return;
        for (const entry of history.devices || []) {
          const device = state.devices.find((item) => Number(item.index) === Number(entry.index));
          const key = device ? deviceKey(device) : entry.host;
          storeForHost(key).merge(entry.history);
        }
        refreshChart();
        renderPorts();
        updateDetail();
      })
      .catch(() => {
        /* history is best effort */
      });
    return;
  }

  getHistory({ host: hostForRequests() || undefined, limit: 180 })
    .then((history) => {
      if (myGen !== state.gen) return;
      const device = primaryDevice();
      storeForHost(device ? deviceKey(device) : hostForRequests() || "default").merge(history);
      refreshChart();
      renderPorts();
      updateDetail();
    })
    .catch(() => {
      /* history is best effort */
    });
}

function renderAll() {
  updateStatus(deriveStatus());
  renderHeader();
  renderHero();
  renderDiscovery();
  renderPorts();
  renderFlow();
  renderSystem();
  renderBanners();
  refreshChart();
  updateDetail();
  updateFooter();
  updateStaticTranslations();
}

function updateFooter() {
  if (!state.aggregate) {
    dom.footStatus.textContent = "—";
    return;
  }
  const source = state.demo ? t("footerDemo") : sourceLabel(state.aggregate.source || primaryDevice()?.source);
  const devicesPart = state.multi ? `${t("multiBadge", { n: state.devices.length })} · ` : "";
  dom.footStatus.textContent = `${devicesPart}${source} · ${t("updatedAt", {
    time: fmtClock(state.aggregate.fetchedAt),
  })}`;
}

function announce() {
  const now = Date.now();
  if (now - state.lastAnnounceAt < 5000) return;
  state.lastAnnounceAt = now;
  if (!state.aggregate) return;
  const totals = aggregateTotals();
  dom.liveRegion.textContent = t("liveAnnounce", {
    power: Number.isFinite(Number(totals?.powerW)) ? fmtWatts(Number(totals.powerW)) : "—",
    charging: Number(totals?.chargingCount) || 0,
  });
}

function scheduleNext(delay) {
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => {
    state.timer = 0;
    poll();
  }, Math.max(1000, delay));
}

function handlePollError(error) {
  state.lastError = error;
  state.lastErrorCode = error?.code || "";
  if (!state.lastGood) state.loading = false;
  const code = String(state.lastErrorCode || "").toUpperCase();
  if (!state.demo && getDevices().length === 0 && ["NO_DEVICE", "NO_DEVICES", "ALL_DEVICES_FAILED"].includes(code)) {
    activateDiscovery(true);
  }
  updateStatus(deriveStatus());
  renderBanners();
  renderDiscovery();
  dom.refreshBtn.classList.remove("is-spinning");
}

async function poll() {
  if (document.hidden) return;
  if (state.polling) {
    state.refreshQueued = true;
    return;
  }
  state.polling = true;
  state.refreshQueued = false;
  const myGen = state.gen;
  try {
    const payload = await fetchData();
    if (myGen !== state.gen) return;
    applyAggregate(payload);
    dom.refreshBtn.classList.remove("is-spinning");
    scheduleNext(currentInterval());
  } catch (error) {
    if (myGen !== state.gen) return;
    handlePollError(error);
    const delay = Math.min(30000, currentInterval() * 2 ** state.backoff);
    state.backoff = Math.min(6, state.backoff + 1);
    scheduleNext(delay);
  } finally {
    if (myGen === state.gen) {
      state.polling = false;
      if (state.refreshQueued) {
        state.refreshQueued = false;
        poll();
      }
    }
  }
}

function refreshNow() {
  dom.refreshBtn.classList.add("is-spinning");
  state.refreshSpinnerUntil = Date.now() + 4000;
  window.setTimeout(() => {
    if (Date.now() >= state.refreshSpinnerUntil) dom.refreshBtn.classList.remove("is-spinning");
  }, 4200);
  if (state.polling) {
    state.refreshQueued = true;
    return;
  }
  window.clearTimeout(state.timer);
  state.timer = 0;
  poll();
}

function restartPolling() {
  state.gen += 1;
  window.clearTimeout(state.timer);
  state.timer = 0;
  state.backoff = 0;
  state.polling = false;
  state.refreshQueued = false;
  if (!document.hidden) poll();
}

function reinitializeData() {
  state.gen += 1;
  window.clearTimeout(state.timer);
  state.timer = 0;
  state.polling = false;
  state.refreshQueued = false;
  state.backoff = 0;
  state.aggregate = null;
  state.devices = [];
  state.lastGood = null;
  state.lastGoodAt = 0;
  state.lastError = null;
  state.lastErrorCode = "";
  state.loading = true;
  state.historySeeded = false;
  state.stores = new Map();
  state.selectedPort = null;
  state.legendSignature = "";
  state.portSignature = "";
  if (state.detailOpen) closeDetail();
  destroyDiagrams();
  renderAll();
  if (state.demo) applyAggregate(demoMulti(state.demoCount));
  else poll();
}

/* ------------------------------------------------------------------ */
/* Static translations                                                */
/* ------------------------------------------------------------------ */

function updateStaticTranslations() {
  dom.langLabel.textContent = getLang() === "zh" ? "EN" : "中";
  dom.langBtn.setAttribute("aria-label", t("switchLang"));
  dom.setupDemoLink.href = urlWithDemo(1);
  dom.setupDemoTwoLink.href = urlWithDemo(2);
  dom.demoOneLink.href = urlWithDemo(1);
  dom.demoTwoLink.href = urlWithDemo(2);
  const host = hostForRequests() || savedDevices()[0]?.host || "";
  dom.setupCmd.textContent = `node server.mjs${host ? ` --host ${host}` : " --host cp02-xxxx.local"}`;
  updateDeviceSwitch();
}

/* ------------------------------------------------------------------ */
/* Device dialog interactions                                         */
/* ------------------------------------------------------------------ */

function bindDeviceDialogEvents() {
  dom.deviceSwitch.addEventListener("click", openDeviceDialog);
  dom.deviceDialogClose.addEventListener("click", closeDeviceDialog);
  dom.deviceDialogDone.addEventListener("click", closeDeviceDialog);
  dom.deviceDialog.addEventListener("click", (event) => {
    if (event.target === dom.deviceDialog) closeDeviceDialog();
  });
  dom.deviceModeTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) return;
    if (button.dataset.mode === "multi" && !state.demo && savedDevices().length < 2) {
      renderDeviceDialog();
      return;
    }
    state.deviceDialogMode = button.dataset.mode;
    if (state.deviceDialogMode === "multi") {
      const current = state.settings.multiHosts || [];
      state.multiDraft = new Set(current.length > 1 ? current : savedDevices().slice(0, MAX_DEVICES).map((item) => item.host));
    }
    renderDeviceDialog();
  });
  dom.deviceApplyMulti.addEventListener("click", () => {
    const hosts = [...state.multiDraft].filter((host) => savedDevices().some((item) => item.host === host));
    setMultiSelection({ enabled: true, hosts });
    state.settings = effectiveSettings();
    closeDeviceDialog();
    reinitializeData();
  });
  dom.deviceScanBtn.addEventListener("click", startDeviceScan);
  dom.deviceManualAdd.addEventListener("click", () => addManualDevice(dom.deviceManualHost, { use: savedDevices().length === 0 }));
  dom.deviceManualHost.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addManualDevice(dom.deviceManualHost, { use: savedDevices().length === 0 });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Events / boot                                                      */
/* ------------------------------------------------------------------ */

function bindEvents() {
  dom.themeBtn.addEventListener("click", () => {
    const next = state.resolvedTheme === "dark" ? "light" : "dark";
    saveSettings({ theme: next });
    state.settings = effectiveSettings();
    applyTheme(next);
    state.legendSignature = "";
    renderFlow();
    refreshChart();
  });

  dom.langBtn.addEventListener("click", () => {
    applyLanguage(getLang() === "zh" ? "en" : "zh");
  });

  dom.settingsBtn.addEventListener("click", openSettings);
  dom.settingsClose.addEventListener("click", closeSettings);
  dom.cancelBtn.addEventListener("click", closeSettings);
  dom.refreshBtn.addEventListener("click", refreshNow);
  dom.settingsForm.addEventListener("submit", handleSave);
  dom.resetBtn.addEventListener("click", handleReset);
  dom.manageDevicesBtn.addEventListener("click", () => {
    closeSettings();
    openDeviceDialog();
  });
  dom.testBtn.addEventListener("click", testConnection);
  dom.scanBtn.addEventListener("click", startScan);

  dom.settingsDialog.addEventListener("click", (event) => {
    if (event.target === dom.settingsDialog) closeSettings();
  });

  dom.rangeTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) return;
    setRange(button.dataset.range);
  });

  dom.viewTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) return;
    setView(button.dataset.view);
  });
  dom.replayBtn.addEventListener("click", replayFlow);

  dom.discoveryScanBtn.addEventListener("click", () => startDiscoveryScan());
  dom.manualAddBtn.addEventListener("click", () => {
    const host = dom.manualHost.value.trim();
    if (!host) return;
    addDeviceEntry({ host }, { use: savedDevices().length === 0 });
    dom.manualHost.value = "";
  });
  dom.manualHost.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      dom.manualAddBtn.click();
    }
  });

  bindDeviceDialogEvents();

  dom.detailClose.addEventListener("click", closeDetail);
  dom.detailLayer.addEventListener("keydown", onSheetKeydown);

  dom.sysDetails.addEventListener("toggle", () => {
    if (dom.sysDetails.open) renderSystem();
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "retry") refreshNow();
    else if (action === "settings" || action === "open-settings") openSettings();
    else if (action === "devices") openDeviceDialog();
    else if (action === "scan") {
      openSettings();
      startScan();
    } else if (action === "close-detail") {
      closeDetail();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.detailOpen) closeDetail();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearTimeout(state.timer);
      state.timer = 0;
    } else {
      updateStatus(deriveStatus());
      renderBanners();
      refreshChart();
      poll();
    }
  });

  state.themeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  state.themeQuery?.addEventListener?.("change", () => {
    if (effectiveSettings().theme !== "auto") return;
    applyTheme("auto");
    state.legendSignature = "";
    renderFlow();
    refreshChart();
  });

  window.addEventListener("resize", () => {
    state.chart?.resize();
    state.chart?.draw();
  });
}

function boot() {
  cacheDom();
  state.settings = effectiveSettings();
  state.demo = state.settings.demo;
  state.demoCount = state.settings.demoDevices || 1;
  state.multi = state.demo ? state.demoCount > 1 : isLiveMulti();
  state.range = RANGES[state.settings.window] ? state.settings.window : "30m";
  state.view = ["pro", "simple", "meter", "cuktech"].includes(state.settings.view)
    ? state.settings.view
    : "pro";

  setLang(state.settings.lang);
  applyTheme(state.settings.theme);
  applyI18n(document);
  updateStaticTranslations();
  initPanelControls();

  bindEvents();

  state.chart = new PowerChart(dom.chart, {
    labels: { total: t("chartTotal") },
    formatTime: (ts) => fmtClock(ts),
    formatPower: (watts) => fmtWatts(watts),
  });
  buildLegend();
  renderAll();
  updateStatus("loading");

  state.staleTimer = window.setInterval(updateStaleIfNeeded, 2500);

  if (state.demo) {
    applyAggregate(demoMulti(state.demoCount));
    return;
  }

  const hasTarget = Boolean(hostForRequests() || savedDevices().length);
  if (!hasTarget) {
    probeProxy()
      .then((health) => {
        if (health?.defaultHost) {
          poll();
        } else {
          activateDiscovery(true);
          poll();
        }
      })
      .catch(() => {
        activateDiscovery(false);
      });
  } else {
    poll();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
