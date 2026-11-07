/**
 * CP-02 dashboard application: state, polling, rendering, interaction.
 * Data access is delegated to ./data.js (documented in docs/DATA-CONTRACT.md).
 */

import {
  HistoryStore,
  demo,
  demoHistoryFor,
  effectiveSettings,
  fmtAmps,
  fmtBytes,
  fmtClock,
  fmtEnergy,
  fmtRssi,
  fmtUptime,
  fmtVolts,
  fmtWatts,
  getHistory,
  getSnapshot,
  getUrlOverrides,
  portColor,
  portName,
  portType,
  probeProxy,
  resetSettings,
  saveSettings,
  scanLan,
} from "./data.js";
import { PowerChart, drawSparkline } from "./charts.js";
import { applyI18n, getLang, protocolLabel, setLang, t } from "./i18n.js";
import { createDiagram } from "./diagram.js";

const PORT_IDS = [0, 1, 2, 3, 4];
const RANGES = { "5m": 5 * 60 * 1000, "30m": 30 * 60 * 1000, "2h": 2 * 60 * 60 * 1000 };
const RANGE_SUB = { "5m": "chartSub5m", "30m": "chartSub30m", "2h": "chartSub2h" };
const HISTORY_MAX_AGE = 2 * 60 * 60 * 1000;

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
  status: "loading",
  loading: true,
  snapshot: null,
  lastGood: null,
  lastGoodAt: 0,
  lastError: null,
  lastErrorCode: "",
  store: null,
  chart: null,
  diagram: null,
  selected: null,
  range: "30m",
  hidden: new Set(),
  portNodes: new Map(),
  timer: 0,
  gen: 0,
  polling: false,
  refreshQueued: false,
  backoff: 0,
  detailOpen: false,
  detailReturnFocus: null,
  lastAnnounceAt: 0,
  legendSignature: "",
  modelChipSignature: "",
  staleTimer: 0,
  themeQuery: null,
  resolvedTheme: "light",
  chartHasData: false,
  historySeeded: false,
  refreshSpinnerUntil: 0,
};

const dom = {};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function cacheDom() {
  dom.root = document.documentElement;
  dom.brandTitle = $("#brandTitle");
  dom.modelChip = $("#modelChip");
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
  dom.totalW = $("#totalW");
  dom.budgetBar = $("#budgetBar");
  dom.budgetFill = $("#budgetFill");
  dom.budgetText = $("#budgetText");
  dom.budgetUtil = $("#budgetUtil");
  dom.statPorts = $("#statPorts");
  dom.statEnergy = $("#statEnergy");
  dom.statVin = $("#statVin");
  dom.statUptime = $("#statUptime");
  dom.diagramWrap = $("#diagramWrap");
  dom.flowBudgetChip = $("#flowBudgetChip");
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
  dom.detailState = $("#detailState");
  dom.detailW = $("#detailW");
  dom.detailProto = $("#detailProto");
  dom.detailGrid = $("#detailGrid");
  dom.detailClose = $("#detailClose");
  dom.detailSpark = $("#detailSpark");
  dom.detailSparkMeta = $("#detailSparkMeta");
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
  dom.testBtn = $("#testBtn");
  dom.scanBtn = $("#scanBtn");
  dom.testStatus = $("#testStatus");
  dom.scanPanel = $("#scanPanel");
  dom.scanList = $("#scanList");
  dom.scanCount = $("#scanCount");
  dom.setupHint = $("#setupHint");
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function powerParts(watts) {
  if (!Number.isFinite(watts)) return "—";
  return watts >= 100 ? String(Math.round(watts)) : watts.toFixed(1);
}

/** Blend a hex colour toward another (used to keep chart lines readable on light). */
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

/** Port accent for chart graphics; slightly darkened in light mode for contrast. */
function chartPortColor(id) {
  const base = portColor(id);
  if (state.resolvedTheme !== "light") return base;
  return mixHex(base, "#1b130a", 0.38);
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

function historyKey() {
  return state.demo ? "demo" : hostForRequests() || "default";
}

function urlWithDemo() {
  const url = new URL(location.href);
  url.searchParams.set("demo", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

function urlWithoutDemo() {
  const url = new URL(location.href);
  url.searchParams.delete("demo");
  return `${url.pathname}${url.search}${url.hash}`;
}

function newHistoryStore() {
  return new HistoryStore(historyKey(), { maxAgeMs: HISTORY_MAX_AGE, minGapMs: 3000 });
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
  if (code === "NO_DEVICE") return false;
  if (code === "TIMEOUT") return false;
  if (code === "NOT_FOUND" || code === "HTTP_404") return true;
  if (code.startsWith("HTTP_")) return true;
  return error.name === "TypeError";
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
    buildLegend(true);
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
    return state.lastErrorCode === "NO_DEVICE" ? "setup" : "offline";
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
    const actions = [];
    if (getUrlOverrides().demo) {
      actions.push({ label: t("demoExit"), href: urlWithoutDemo() });
    }
    banners.push({
      tone: "demo",
      title: t("demoBannerTitle"),
      text: t("demoBannerText"),
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
        actions: [...actions, { label: t("enterDemo"), href: urlWithDemo() }],
      });
    } else {
      banners.push({
        tone: "bad",
        title: t("offlineTitle"),
        text: state.lastGood
          ? t("offlineText", { time: fmtClock(state.lastGood.fetchedAt) })
          : t("offlineNoData"),
        actions,
      });
    }
  } else if (status === "stale") {
    banners.push({
      tone: "warn",
      title: t("staleTitle"),
      text: t("staleText", { time: fmtClock(state.lastGood?.fetchedAt) }),
      actions: [{ label: t("retry"), action: "retry" }],
    });
  }

  if (!state.demo && state.snapshot && status !== "offline") {
    const warnings = (state.snapshot.warnings || [])
      .map((warning) => String(warning))
      .filter((warning) => warning && !warning.includes("演示"))
      .slice(0, 3);
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

function shouldShowSetup() {
  if (state.demo) return false;
  if (state.lastGood) return false;
  if (state.loading) return false;
  return deriveStatus() === "setup";
}

/* ------------------------------------------------------------------ */
/* Header / hero                                                      */
/* ------------------------------------------------------------------ */

function renderHeader(snapshot) {
  const device = snapshot?.device || {};
  const display =
    typeof device.modelLabel === "string" && device.modelLabel.trim()
      ? device.modelLabel.replace(/（[^）]*）|\([^)]*\)/g, "").trim() || device.modelLabel
      : "AI 小电拼 Pro / Ultra";
  dom.brandTitle.textContent = display;
  dom.brandTitle.title = device.modelLabel || display;

  const model = device.model ? String(device.model) : "";
  const familyRaw = device.family ? String(device.family) : "CP-02";
  const family = familyRaw.replace(/^CP(\d+)$/i, "CP-$1");
  const maxPower = Number(device.maxPowerW) || 160;
  const portCount = t("portCount", { n: 5 });
  const chipParts = [
    { cls: "mc-family", text: family },
    { cls: "mc-spec", text: ` · ${maxPower}W · ${portCount}` },
  ];
  if (model) chipParts.push({ cls: "mc-model", text: ` · ${model}` });
  const chipSignature = chipParts.map((part) => part.text).join("");
  if (chipSignature !== state.modelChipSignature) {
    state.modelChipSignature = chipSignature;
    const spans = chipParts.map((part) => {
      const span = document.createElement("span");
      span.className = part.cls;
      span.textContent = part.text;
      return span;
    });
    dom.modelChip.replaceChildren(...spans);
  }

  const fw = device.esp32Version || snapshot?.system?.appVersion;
  dom.fwVersion.textContent = fw ? String(fw) : "—";

  const psn = device.psn;
  dom.psnText.textContent = state.demo ? psn || "—" : maskPsn(psn);
  dom.psnText.title = state.demo ? String(psn || "") : t("labelPsn");

  dom.flowBudgetChip.textContent = t("budgetChip", { w: Math.round(Number(snapshot?.totals?.budgetW) || maxPower) });
}

function setUnavailable(element, unavailable, title) {
  element.classList.toggle("is-unavailable", Boolean(unavailable));
  if (title) element.title = title;
  else element.removeAttribute("title");
}

function renderHero(snapshot) {
  const totals = snapshot?.totals;
  const device = snapshot?.device;
  const energyAvailable = snapshot?.capabilities?.energy !== false;
  const budget = Number(totals?.budgetW) || Number(device?.maxPowerW) || 160;
  const power = Number(totals?.powerW);
  const utilizationRaw = Number(totals?.utilization);
  const utilization = Number.isFinite(utilizationRaw)
    ? utilizationRaw
    : Number.isFinite(power) && budget > 0
      ? (power / budget) * 100
      : NaN;

  dom.totalW.textContent = snapshot ? powerParts(power) : "—";
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
  dom.heroFresh.textContent = snapshot ? t("updatedAt", { time: fmtClock(snapshot.fetchedAt) }) : "—";

  if (!snapshot) {
    dom.statPorts.textContent = "—";
    setUnavailable(dom.statEnergy, false);
    dom.statEnergy.textContent = "—";
    dom.statVin.textContent = "—";
    dom.statUptime.textContent = "—";
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

  let inputVoltage = Number(totals?.inputVoltageV);
  if (!Number.isFinite(inputVoltage) && Array.isArray(snapshot.ports)) {
    const vins = snapshot.ports.map((port) => Number(port.vinMv)).filter((value) => Number.isFinite(value) && value > 0);
    if (vins.length > 0) inputVoltage = vins.reduce((sum, value) => sum + value, 0) / vins.length / 1000;
  }
  const vinAvailable = Number.isFinite(inputVoltage) && inputVoltage > 0;
  dom.statVin.textContent = vinAvailable ? `${inputVoltage.toFixed(2)} V` : "—";
  setUnavailable(dom.statVin, !vinAvailable, t("energyUnavailable"));
  dom.statUptime.textContent = fmtUptime(Number(snapshot.system?.uptimeSeconds));
}

/* ------------------------------------------------------------------ */
/* Port cards                                                         */
/* ------------------------------------------------------------------ */

function ensurePortCards() {
  if (state.portNodes.size === PORT_IDS.length) return;
  state.portNodes.clear();
  dom.portGrid.replaceChildren();

  for (const id of PORT_IDS) {
    const li = document.createElement("li");
    li.className = "port-card";
    li.dataset.port = String(id);
    li.style.setProperty("--pc", portColor(id));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "port-btn";

    const top = document.createElement("span");
    top.className = "pc-top";
    const name = document.createElement("span");
    name.className = "pc-name";
    const type = document.createElement("span");
    type.className = "pc-type";
    const status = document.createElement("span");
    status.className = "pc-state";
    top.append(name, type, status);

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
    dom.portGrid.append(li);

    button.addEventListener("click", () => openDetail(id));

    state.portNodes.set(id, { li, button, name, type, status, num, proto, sub, energy, time, spark });
  }
}

function renderPorts(snapshot) {
  ensurePortCards();
  const energyAvailable = snapshot?.capabilities?.energy !== false;
  const now = Date.now();

  for (const id of PORT_IDS) {
    const refs = state.portNodes.get(id);
    if (!refs) continue;
    const port = findPort(snapshot, id);
    const power = Number(port?.powerW);
    const charging = Boolean(port && port.attached && power >= 0.1 && port.active !== false);
    const inactive = Boolean(port && port.active === false);
    const idle = !port || !port.attached || inactive;

    const selectedId =
      state.selected === null || state.selected === undefined ? NaN : Number(state.selected);
    refs.li.style.setProperty("--pc", portColor(id));
    refs.li.classList.toggle("is-charging", charging);
    refs.li.classList.toggle("is-idle", idle);
    refs.li.classList.toggle("is-off", inactive);
    refs.li.classList.toggle("is-selected", selectedId === id);

    refs.name.textContent = port?.name || portName(id);
    refs.type.textContent = t((port?.type || portType(id)) === "A" ? "portTypeA" : "portTypeC");
    refs.status.textContent = stateText(port);
    refs.status.dataset.tone = stateTone(port);
    refs.num.textContent = port ? powerParts(power) : "—";
    refs.proto.textContent = port ? protocolLabel(port) : "—";
    refs.sub.textContent = port && port.attached ? `${fmtVolts(Number(port.voltageMv))} · ${fmtAmps(Number(port.currentMa))}` : "—";

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
      t("portAria", {
        name: port?.name || portName(id),
        power: port ? fmtWatts(power) : "—",
        state: stateText(port),
      }),
    );

    const series = state.store?.series().find((entry) => entry.id === id);
    if (series && refs.spark.offsetParent !== null) {
      const samples = series.samples.filter((sample) => sample.t >= now - 30 * 60 * 1000);
      drawSparkline(refs.spark, samples, portColor(id));
    }
  }
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

function renderSystem(snapshot) {
  const device = snapshot?.device || {};
  const system = snapshot?.system || {};
  const wifi = snapshot?.wifi || {};
  const source = snapshot?.source || "";
  const energyAvailable = snapshot?.capabilities?.energy !== false;
  const isProm = source === "prometheus" || snapshot?.capabilities?.prometheus === true;

  dom.sourceBadge.textContent = snapshot ? sourceLabel(source) : "—";
  dom.sourceBadge.dataset.source = source || "";
  dom.promNote.hidden = !snapshot || (!isProm && energyAvailable);

  const groups = [];

  if (snapshot) {
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
        [t("labelHost"), snapshot.host || hostForRequests() || "—"],
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
        [t("labelLatency"), Number.isFinite(snapshot.latencyMs) ? `${snapshot.latencyMs} ms` : "—"],
        [t("labelUpdated"), fmtClock(snapshot.fetchedAt)],
      ]),
      sysGroup(t("sysSource"), [
        [t("sysSource"), sourceLabel(source)],
        [t("labelHost"), snapshot.host || hostForRequests() || "—"],
        [t("portsLabel"), `${Array.isArray(snapshot.ports) ? snapshot.ports.length : 0} / 5`],
        [t("labelUpdated"), fmtDateTime(snapshot.fetchedAt)],
      ]),
    );
  }

  dom.sysGrid.replaceChildren(...groups);
}

/* ------------------------------------------------------------------ */
/* Chart                                                              */
/* ------------------------------------------------------------------ */

function computeTotal(ports) {
  const times = new Set();
  for (const port of ports) {
    for (const sample of port.samples || []) {
      if (Number.isFinite(sample.t)) times.add(sample.t);
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const cursors = ports.map(() => 0);
  const maxGap = 90000;
  const result = [];
  for (const t of sorted) {
    let sum = 0;
    for (let i = 0; i < ports.length; i += 1) {
      const samples = ports[i].samples || [];
      while (cursors[i] + 1 < samples.length && samples[cursors[i] + 1].t <= t) cursors[i] += 1;
      const sample = samples[cursors[i]];
      if (sample && sample.t <= t && t - sample.t <= maxGap) sum += Number(sample.powerW) || 0;
    }
    result.push({ t, powerW: Math.round(sum * 1000) / 1000 });
  }
  return result;
}

function visibleSeriesIds() {
  return ["total", ...PORT_IDS.map(String)].filter((id) => !state.hidden.has(id));
}

function buildChartData() {
  const ports = (state.store?.series() || []).map((port) => ({
    id: port.id,
    name: port.name || portName(port.id),
    color: chartPortColor(port.id),
    samples: port.samples || [],
  }));
  return { ports, total: computeTotal(ports) };
}

function buildLegend(force = false) {
  const items = [
    { id: "total", label: t("chartTotal"), color: cssVar("--chart-total", "#b45309") },
    ...PORT_IDS.map((id) => ({ id: String(id), label: portName(id), color: chartPortColor(id) })),
  ];
  const signature = items.map((item) => `${item.id}:${item.label}:${item.color}`).join("|");
  if (!force && signature === state.legendSignature) return;
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
  buildLegend();
  const { ports, total } = buildChartData();
  state.chart.setLabels({ total: t("chartTotal") });
  state.chart.setData({
    ports,
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
/* Diagram                                                            */
/* ------------------------------------------------------------------ */

function buildDiagram() {
  state.diagram = createDiagram(dom.diagramWrap, {
    onSelect: (id) => openDetail(id),
    describe: (port, id) =>
      t("portAria", {
        name: port?.name || portName(id),
        power: port ? fmtWatts(Number(port.powerW)) : "—",
        state: stateText(port),
      }),
  });
}

function renderDiagram(snapshot) {
  state.diagram?.update(snapshot, { selected: state.selected });
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
  if (!state.detailOpen || state.selected === null) return;
  const id = Number(state.selected);
  const port = findPort(state.snapshot, id);
  const snapshot = state.snapshot;
  const energyAvailable = snapshot?.capabilities?.energy !== false;
  const color = portColor(id);

  dom.detailTitle.textContent = port?.name || portName(id);
  dom.detailDot.style.setProperty("--pc", color);
  dom.detailState.textContent = stateText(port);
  dom.detailState.dataset.tone = stateTone(port);
  dom.detailW.textContent = port ? powerParts(Number(port.powerW)) : "—";
  dom.detailProto.textContent = port ? protocolLabel(port) : "—";
  dom.detailProto.style.setProperty("--pc", color);

  const deviceMax = Number(snapshot?.device?.portMaxW?.[id]);
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

  const series = state.store?.series().find((entry) => entry.id === id);
  const samples = (series?.samples || []).filter((sample) => sample.t >= Date.now() - 30 * 60 * 1000);
  const peak = samples.reduce((max, sample) => Math.max(max, Number(sample.powerW) || 0), 0);
  dom.detailSparkMeta.textContent = samples.length
    ? t("sparkMeta", { count: samples.length, peak: fmtWatts(peak) })
    : t("noHistory");
  if (dom.detailSpark.offsetParent !== null) {
    drawSparkline(dom.detailSpark, samples, color, { maxGapMs: 90000 });
  }
}

function openDetail(id) {
  if (state.detailOpen && Number(state.selected) === Number(id)) return;
  state.selected = Number(id);
  state.detailOpen = true;
  state.detailReturnFocus = document.activeElement;
  updateDetail();
  renderDiagram(state.snapshot);
  renderPorts(state.snapshot);

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
    state.selected = null;
    renderDiagram(state.snapshot);
    renderPorts(state.snapshot);
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
/* Settings                                                           */
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
        meta.textContent = t("scanDeviceMeta", {
          ip: device.ip || device.host || "—",
          psn: device.psn ? maskPsn(device.psn) : "—",
        });
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

function restartPolling() {
  state.gen += 1;
  window.clearTimeout(state.timer);
  state.timer = 0;
  state.backoff = 0;
  state.polling = false;
  state.refreshQueued = false;
  if (!document.hidden) poll();
}

function applyLanguage(language, { persist = true } = {}) {
  if (persist) saveSettings({ lang: language });
  state.settings = effectiveSettings();
  setLang(state.settings.lang);
  applyI18n(document);
  updateStaticTranslations();
  state.diagram?.refreshLabels();
  buildLegend(true);
  renderAll();
}

function handleSave(event) {
  event.preventDefault();
  const previousHost = hostForRequests();
  const previousMode = modeForRequests();
  const patch = {
    host: dom.setHost.value.trim(),
    mode: dom.setMode.value,
    intervalMs: Number(dom.setInterval.value) || 3000,
    theme: dom.setTheme.value,
    lang: dom.setLang.value,
    window: state.range,
  };
  saveSettings(patch);
  state.settings = effectiveSettings();
  state.demo = state.settings.demo;
  const hostChanged = hostForRequests() !== previousHost || modeForRequests() !== previousMode;

  setLang(state.settings.lang);
  applyTheme(state.settings.theme);
  applyI18n(document);
  updateStaticTranslations();
  closeSettings();

  if (hostChanged) {
    state.gen += 1;
    window.clearTimeout(state.timer);
    state.timer = 0;
    state.snapshot = null;
    state.lastGood = null;
    state.lastGoodAt = 0;
    state.lastError = null;
    state.lastErrorCode = "";
    state.loading = true;
    state.chartHasData = false;
    state.historySeeded = false;
    state.store = newHistoryStore();
    if (state.demo) seedDemoHistory();
    else seedLiveHistory();
  }

  buildLegend(true);
  renderAll();
  restartPolling();
}

function handleReset() {
  resetSettings();
  state.settings = effectiveSettings();
  state.demo = state.settings.demo;
  setLang(state.settings.lang);
  applyTheme(state.settings.theme);
  applyI18n(document);
  updateStaticTranslations();
  populateSettingsForm();
  closeSettings();
  state.snapshot = null;
  state.lastGood = null;
  state.lastGoodAt = 0;
  state.lastError = null;
  state.loading = true;
  state.chartHasData = false;
  state.store = newHistoryStore();
  if (state.demo) seedDemoHistory();
  else seedLiveHistory();
  renderAll();
  restartPolling();
}

/* ------------------------------------------------------------------ */
/* Data flow                                                          */
/* ------------------------------------------------------------------ */

function applySnapshot(snapshot) {
  state.snapshot = snapshot;
  state.lastGood = snapshot;
  state.lastGoodAt = Date.now();
  state.lastError = null;
  state.lastErrorCode = "";
  state.loading = false;
  state.backoff = 0;

  if (state.store) state.store.add(snapshot);

  const status = deriveStatus();
  updateStatus(status);
  renderAll();
  announce();
}

function renderAll() {
  const snapshot = state.snapshot;
  updateStatus(deriveStatus());
  renderHeader(snapshot);
  renderHero(snapshot);
  renderPorts(snapshot);
  renderDiagram(snapshot);
  renderSystem(snapshot);
  renderBanners();
  refreshChart();
  updateDetail();
  updateFooter(snapshot);
  updateStaticTranslations();
  dom.setupCard.hidden = !shouldShowSetup();
}

function updateFooter(snapshot) {
  if (!snapshot) {
    dom.footStatus.textContent = "—";
    return;
  }
  const source = state.demo ? t("footerDemo") : sourceLabel(snapshot.source);
  dom.footStatus.textContent = `${source} · ${t("updatedAt", { time: fmtClock(snapshot.fetchedAt) })}`;
}

function announce() {
  const now = Date.now();
  if (now - state.lastAnnounceAt < 5000) return;
  state.lastAnnounceAt = now;
  const snapshot = state.snapshot;
  if (!snapshot) return;
  dom.liveRegion.textContent = t("liveAnnounce", {
    power: Number.isFinite(Number(snapshot.totals?.powerW)) ? fmtWatts(Number(snapshot.totals.powerW)) : "—",
    charging: Number(snapshot.totals?.chargingCount) || 0,
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
  updateStatus(deriveStatus());
  renderBanners();
  dom.setupCard.hidden = !shouldShowSetup();
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
    const snapshot = state.demo
      ? demo()
      : await getSnapshot({ host: hostForRequests() || undefined, mode: modeForRequests() });
    if (myGen !== state.gen) return;
    state.lastError = null;
    state.lastErrorCode = "";
    state.backoff = 0;
    applySnapshot(snapshot);
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

function seedDemoHistory() {
  try {
    state.store.merge(demoHistoryFor(Date.now(), 720));
  } catch {
    /* demo history is best-effort */
  }
  state.historySeeded = true;
  refreshChart();
}

function applyDemo() {
  seedDemoHistory();
  applySnapshot(demo());
}

async function seedLiveHistory() {
  const myGen = state.gen;
  try {
    const history = await getHistory({ host: hostForRequests() || undefined, limit: 180 });
    if (myGen !== state.gen) return;
    state.store.merge(history);
    state.historySeeded = true;
    refreshChart();
    renderPorts(state.snapshot);
    updateDetail();
  } catch {
    if (myGen === state.gen) state.historySeeded = true;
  }
}

function restartSessionData() {
  state.gen += 1;
  window.clearTimeout(state.timer);
  state.timer = 0;
  state.snapshot = null;
  state.lastGood = null;
  state.lastGoodAt = 0;
  state.loading = true;
  state.chartHasData = false;
  state.store = newHistoryStore();
  state.historySeeded = false;
  if (state.demo) seedDemoHistory();
  else seedLiveHistory();
}

/* ------------------------------------------------------------------ */
/* Static translations                                                */
/* ------------------------------------------------------------------ */

function updateStaticTranslations() {
  dom.langLabel.textContent = getLang() === "zh" ? "EN" : "中";
  dom.langBtn.setAttribute("aria-label", t("switchLang"));
  dom.setupDemoLink.href = urlWithDemo();
  const host = hostForRequests();
  dom.setupCmd.textContent = `node server.mjs${host ? ` --host ${host}` : " --host cp02-xxxx.local"}`;
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
    buildLegend(true);
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

  dom.detailClose.addEventListener("click", closeDetail);
  dom.detailLayer.addEventListener("keydown", onSheetKeydown);

  dom.sysDetails.addEventListener("toggle", () => {
    if (dom.sysDetails.open) renderSystem(state.snapshot);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "retry") refreshNow();
    else if (action === "settings" || action === "open-settings") openSettings();
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
    buildLegend(true);
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
  state.range = RANGES[state.settings.window] ? state.settings.window : "30m";

  setLang(state.settings.lang);
  applyTheme(state.settings.theme);
  applyI18n(document);
  updateStaticTranslations();

  bindEvents();

  state.chart = new PowerChart(dom.chart, {
    labels: { total: t("chartTotal") },
    formatTime: (ts) => fmtClock(ts),
    formatPower: (watts) => fmtWatts(watts),
  });
  buildDiagram();
  ensurePortCards();
  state.store = newHistoryStore();
  buildLegend(true);

  renderAll();
  updateStatus("loading");

  state.staleTimer = window.setInterval(updateStaleIfNeeded, 2500);

  if (state.demo) {
    applyDemo();
  } else {
    seedLiveHistory();
    poll();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
