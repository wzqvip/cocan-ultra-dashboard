/**
 * Normalization layer: CANDYSIGN CP-02 /metrics.json + Prometheus /metrics
 * → one stable snapshot shape (docs/DATA-CONTRACT.md).
 *
 * Pure functions only, so this can be unit-tested without a device.
 */

export const SESSION_CHARGE_UNIT_UWS = 24.552; // SW3566 raw counter → µWs
export const DEFAULT_BUDGET_W = 160; // CP-02 Ultra nominal system budget
export const PORT_MAX_W = [60, 140, 140, 140, 140];
export const MAX_PORT_ID = 4;

export const PROTOCOLS = {
  0: { key: "usb", label: "USB 普通", family: "usb" },
  1: { key: "qc2", label: "QC2.0", family: "vendor" },
  2: { key: "qc3", label: "QC3.0", family: "vendor" },
  3: { key: "qc3p", label: "QC3+", family: "vendor" },
  4: { key: "sfcp", label: "SFCP", family: "vendor" },
  5: { key: "afc", label: "AFC", family: "vendor" },
  6: { key: "fcp", label: "FCP", family: "vendor" },
  7: { key: "scp", label: "SCP", family: "vendor" },
  8: { key: "vooc1", label: "VOOC 1.0", family: "vendor" },
  9: { key: "vooc4", label: "VOOC 4.0", family: "vendor" },
  10: { key: "svooc2", label: "SuperVOOC 2.0", family: "vendor" },
  11: { key: "tfcp", label: "TFCP", family: "vendor" },
  12: { key: "ufcs", label: "UFCS", family: "vendor" },
  13: { key: "pe1", label: "PE 1.0", family: "vendor" },
  14: { key: "pe2", label: "PE 2.0", family: "vendor" },
  15: { key: "pd5v", label: "PD 5V", family: "pd" },
  16: { key: "pdhv", label: "PD 高压", family: "pd" },
  17: { key: "pd_spr_avs", label: "PD SPR AVS", family: "pd" },
  18: { key: "pps", label: "PD PPS", family: "pps" },
  19: { key: "epr", label: "PD EPR", family: "pd" },
  20: { key: "pd_avs", label: "PD AVS", family: "pd" },
  255: { key: "not_charging", label: "未充电", family: "idle" },
};

const STATE_META = {
  ACTIVE: { label: "空闲", tone: "idle" },
  ATTACHED: { label: "已连接", tone: "attached" },
  INACTIVE: { label: "已关闭", tone: "off" },
  BOOTING: { label: "启动中", tone: "busy" },
  DETACHING: { label: "断开中", tone: "busy" },
  OPENING: { label: "开启中", tone: "busy" },
  CLOSING: { label: "关闭中", tone: "busy" },
  OVER_TEMP_WARNING: { label: "过温预警", tone: "warn" },
  OVER_TEMP_ALERT: { label: "过温保护", tone: "error" },
  COOLING: { label: "冷却中", tone: "warn" },
  CHECKING: { label: "检测中", tone: "busy" },
  RECOVERING: { label: "恢复中", tone: "busy" },
  DEAD: { label: "故障", tone: "error" },
  LIMITED_POWER: { label: "限功率", tone: "warn" },
};

export function decodeProtocol(code) {
  const n = Number(code);
  const p = PROTOCOLS[n];
  if (!p) {
    return {
      code: Number.isFinite(n) ? n : null,
      key: "unknown",
      label: n === 255 ? "未充电" : `未知 (${code})`,
      family: "unknown",
    };
  }
  return { code: n, ...p };
}

export function portName(id) {
  return Number(id) === 0 ? "A" : `C${Number(id)}`;
}

export function portType(id, raw) {
  if (raw === "A" || raw === "C") return raw;
  return Number(id) === 0 ? "A" : "C";
}

export function resetReasonLabel(code) {
  const map = {
    0: "未知",
    1: "上电",
    2: "外部复位",
    3: "软件复位",
    4: "看门狗",
    5: "深睡唤醒",
    6: "掉电",
    7: "任务看门狗",
    8: "其它",
    9: "欠压",
  };
  return map[Number(code)] || (code == null ? null : `原因 ${code}`);
}

export function round(n, digits = 3) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function sessionWhFromRaw(raw) {
  const n = num(raw);
  if (n === null) return null;
  return round((n * SESSION_CHARGE_UNIT_UWS) / 3.6e9, 4);
}

export function parseInfoHtml(html) {
  const text = String(html || "");
  const info = extractJson(text, "__INFOZ");
  const endpoints = extractJson(text, "__ENDPOINTS");
  const config = extractJson(text, "__CONFIG");
  return {
    info: info && typeof info === "object" ? info : null,
    endpoints: Array.isArray(endpoints) ? endpoints : null,
    config: config && typeof config === "object" ? config : null,
  };
}

function extractJson(text, varName) {
  const marker = `window.${varName}=`;
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = at + marker.length;
  const open = text[start];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function buildDevice(info) {
  const src = info || {};
  const family = src.product_family || null;
  const modelName =
    src.device_model === "ultra" ? "Ultra" : src.device_model === "pro" ? "Pro" : "";
  const modelLabel =
    family === "CP02"
      ? modelName
        ? `AI 小电拼 ${modelName}（CP-02）`
        : "AI 小电拼 CP-02"
      : family
        ? `小电拼 ${family}`
        : "小电拼 (模型未知)";
  return {
    psn: src.psn ?? null,
    name: src.device_name ?? null,
    model: src.device_model ?? null,
    family,
    modelLabel,
    color: src.product_color ?? null,
    hwRev: src.hw_rev ?? null,
    esp32Version: src.esp32_version ?? null,
    mcuVersion: src.mcu_version ?? null,
    fpgaVersion: src.fpga_version ?? null,
    zrlibVersion: src.zrlib_version ?? null,
    country: src.country_code ?? null,
    mdnsHostname: src.mdns_hostname ?? null,
    bleMac: src.ble_mac ?? null,
    wifiMac: src.wifi_mac ?? null,
    maxPowerW: family === "CP02" ? DEFAULT_BUDGET_W : null,
    portMaxW: PORT_MAX_W.slice(),
  };
}

function stateLabelFor({ state, active, attached, powerW }) {
  if (!active) return "已关闭";
  if (state === "ATTACHED") return powerW >= 0.1 ? "充电中" : "已连接 · 未取电";
  if (state === "ACTIVE") return "空闲";
  const meta = STATE_META[state];
  return meta ? meta.label : state || "未知";
}

function stateToneFor({ state, active, attached, powerW }) {
  if (!active) return "off";
  if (state === "ATTACHED") return powerW >= 0.1 ? "charging" : "attached";
  if (state === "ACTIVE") return "idle";
  return STATE_META[state]?.tone || "busy";
}

function normalizePortBase(raw, id) {
  const protocol = decodeProtocol(raw.fc_protocol);
  const voltageMv = num(raw.voltage) ?? 0;
  const currentMa = num(raw.current) ?? 0;
  const powerW = round((voltageMv * currentMa) / 1e6, 3);
  const attached = Boolean(raw.attached);
  const active = raw.active !== false;
  const state = typeof raw.state === "string" && raw.state ? raw.state : attached ? "ATTACHED" : "ACTIVE";
  const chargingSeconds = num(raw.charging_duration_seconds);
  const sessionChargeRaw = num(raw.session_charge);
  return {
    id,
    name: portName(id),
    type: portType(id, raw.port_type),
    active,
    attached,
    state,
    stateLabel: stateLabelFor({ state, active, attached, powerW }),
    stateTone: stateToneFor({ state, active, attached, powerW }),
    voltageMv: Math.round(voltageMv),
    currentMa: Math.round(currentMa),
    powerW,
    protocolCode: protocol.code,
    protocol: protocol.key,
    protocolLabel: protocol.label,
    protocolFamily: protocol.family,
    chargingSeconds: chargingSeconds == null ? null : Math.round(chargingSeconds),
    sessionId: num(raw.session_id),
    sessionChargeRaw: sessionChargeRaw == null ? null : Math.round(sessionChargeRaw),
    sessionWh: sessionWhFromRaw(sessionChargeRaw),
    vinMv: num(raw.vin_value),
    powerBudgetW: num(raw.power_budget),
    pdStatus: raw.pd_status ?? null,
  };
}

function buildTotals(ports, device) {
  const powerW = round(
    ports.reduce((sum, p) => sum + (Number.isFinite(p.powerW) ? p.powerW : 0), 0),
    2,
  );
  const attachedCount = ports.filter((p) => p.attached).length;
  const chargingCount = ports.filter((p) => p.attached && p.powerW >= 0.1).length;
  const energies = ports.map((p) => p.sessionWh).filter((v) => Number.isFinite(v));
  const sessionWh = energies.length ? round(energies.reduce((a, b) => a + b, 0), 3) : null;
  const budgetW = Number(device?.maxPowerW) || DEFAULT_BUDGET_W;
  const utilizations = ports.map((p) => p.vinMv).filter((v) => Number.isFinite(v) && v > 0);
  const inputVoltageV = utilizations.length
    ? round(utilizations.reduce((a, b) => a + b, 0) / utilizations.length / 1000, 2)
    : null;
  return {
    powerW,
    attachedCount,
    chargingCount,
    sessionWh,
    budgetW,
    utilization: budgetW > 0 ? round((powerW / budgetW) * 100, 1) : null,
    inputVoltageV,
  };
}

function assemble({ source, host, now, info, ports, system, wifi, warnings, capabilities }) {
  const device = buildDevice(info);
  const normalizedPorts = ports
    .filter((p) => p && Number.isInteger(p.id) && p.id >= 0 && p.id <= MAX_PORT_ID)
    .sort((a, b) => a.id - b.id);
  const totals = buildTotals(normalizedPorts, device);
  return {
    ok: true,
    source,
    host: host || null,
    fetchedAt: now,
    mode: source,
    warnings: warnings || [],
    device,
    system: system || {},
    wifi: wifi || null,
    ports: normalizedPorts,
    totals,
    capabilities: capabilities || {},
  };
}

export function normalizeJson(raw, { info = null, host = null, now = Date.now(), warnings = [] } = {}) {
  if (!raw || !Array.isArray(raw.ports)) {
    throw new Error("metrics.json 缺少 ports 数组");
  }
  const ports = raw.ports.map((p) => normalizePortBase(p, Number(p.id)));
  const sys = raw.system || {};
  const system = {
    chip: sys.chip ?? null,
    cores: num(sys.cores),
    cpuFreqMhz: num(sys.cpu_freq_mhz),
    idfVersion: sys.idf_version ?? null,
    appVersion: sys.app_version ?? null,
    uptimeSeconds: num(sys.boot_time_seconds),
    bootTimeSeconds: num(sys.boot_time_seconds),
    resetReason: num(sys.reset_reason),
    resetReasonLabel: resetReasonLabel(sys.reset_reason),
    freeHeap: num(sys.free_heap),
    tasks: Array.isArray(raw.tasks) ? raw.tasks : null,
  };
  const wifi = raw.wifi
    ? {
        ssid: raw.wifi.ssid ?? null,
        bssid: raw.wifi.bssid ?? null,
        channel: num(raw.wifi.channel),
        rssi: num(raw.wifi.rssi),
      }
    : null;
  const pdAvailable = ports.some((p) => p.pdStatus != null);
  return assemble({
    source: "metrics.json",
    host,
    now,
    info,
    ports,
    system,
    wifi,
    warnings,
    capabilities: {
      energy: true,
      deviceInfo: Boolean(info),
      pd: pdAvailable,
      temperature: false,
      prometheus: false,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Prometheus text parsing                                            */
/* ------------------------------------------------------------------ */

export function parsePrometheusText(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(\S+)$/);
    if (!m) continue;
    const value = Number(m[4]);
    if (!Number.isFinite(value)) continue;
    out.push({ name: m[1], labels: parseLabels(m[3] || ""), value });
  }
  return out;
}

function parseLabels(text) {
  const labels = {};
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text))) {
    labels[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
  }
  return labels;
}

function pick(samples, name, match = {}) {
  for (const s of samples) {
    if (s.name !== name) continue;
    let ok = true;
    for (const [k, v] of Object.entries(match)) {
      if (String(s.labels[k]) !== String(v)) {
        ok = false;
        break;
      }
    }
    if (ok) return s.value;
  }
  return null;
}

export function normalizePrometheus(
  text,
  { info = null, host = null, now = Date.now(), warnings = [] } = {},
) {
  const samples = parsePrometheusText(text);
  const ports = [];
  for (let id = 0; id <= MAX_PORT_ID; id += 1) {
    const raw = {
      id,
      active: (pick(samples, "ionbridge_port_state", { id }) ?? 1) !== 0,
      fc_protocol: pick(samples, "ionbridge_port_fc_protocol", { id }) ?? 255,
      voltage: pick(samples, "ionbridge_port_voltage", { id }) ?? 0,
      current: pick(samples, "ionbridge_port_current", { id }) ?? 0,
    };
    // Prometheus 端点没有 attached/port_type；按电压/协议推断连接状态。
    raw.attached = raw.voltage > 1000 || raw.current > 20;
    raw.port_type = id === 0 ? "A" : "C";
    const p = normalizePortBase(raw, id);
    p.vinMv = null;
    p.powerBudgetW = null;
    p.chargingSeconds = null;
    p.sessionChargeRaw = null;
    p.sessionWh = null;
    p.sessionId = null;
    p.pdStatus = null;
    ports.push(p);
  }

  const boot = pick(samples, "ionbridge_boot_time_seconds") ?? null;
  const uptime = pick(samples, "ionbridge_uptime_seconds") ?? boot;
  const freeHeap = pick(samples, "ionbridge_free_heap");
  const resetSample = samples.find((s) => s.name === "ionbridge_boot_time_seconds");
  const resetReason = resetSample ? num(resetSample.labels.reset_reason) : null;
  const system = {
    chip: null,
    cores: null,
    cpuFreqMhz: null,
    idfVersion: null,
    appVersion: null,
    uptimeSeconds: num(uptime),
    bootTimeSeconds: num(boot),
    resetReason,
    resetReasonLabel: resetReasonLabel(resetReason),
    freeHeap: freeHeap == null ? null : num(freeHeap),
    tasks: buildTasks(samples),
  };

  const wifiSample = samples.find((s) => s.name === "ionbridge_wifi_signal");
  const wifi = wifiSample
    ? {
        ssid: wifiSample.labels.ssid ?? null,
        bssid: wifiSample.labels.bssid ?? null,
        channel: num(wifiSample.labels.channel),
        rssi: num(wifiSample.value),
      }
    : null;

  const mergedWarnings = warnings.concat(
    "Prometheus 端点不提供充电时长、累计电量与端口连接状态；连接状态按电压推断。",
  );
  return assemble({
    source: "prometheus",
    host,
    now,
    info,
    ports,
    system,
    wifi,
    warnings: mergedWarnings,
    capabilities: {
      energy: false,
      deviceInfo: Boolean(info),
      pd: false,
      temperature: false,
      prometheus: true,
    },
  });
}

function buildTasks(samples) {
  const tasks = new Map();
  for (const s of samples) {
    if (s.name === "ionbridge_task_stack_watermark_bytes" && s.labels.task) {
      const t = tasks.get(s.labels.task) || { name: s.labels.task };
      t.stackWatermarkBytes = s.value;
      tasks.set(s.labels.task, t);
    } else if (s.name === "ionbridge_task_cpu_percent" && s.labels.task) {
      const t = tasks.get(s.labels.task) || { name: s.labels.task };
      t.cpuPercent = s.value;
      tasks.set(s.labels.task, t);
    }
  }
  return tasks.size ? [...tasks.values()] : null;
}

/* ------------------------------------------------------------------ */
/* History                                                            */
/* ------------------------------------------------------------------ */

export function normalizeHistory(payload, { snapshot = null, now = Date.now(), host = null } = {}) {
  if (!payload || !Array.isArray(payload.ports)) {
    throw new Error("porthistoryz 缺少 ports 数组");
  }
  const period = num(payload.sample_period_ms) || 10000;
  const metaById = new Map((snapshot?.ports || []).map((p) => [p.id, p]));
  const ports = payload.ports
    .map((item) => {
      const id = Number(item?.port);
      const meta = metaById.get(id);
      const samples = (Array.isArray(item.samples) ? item.samples : [])
        .map((s, i, arr) => {
          const voltageMv = num(s?.voltage);
          const currentMa = num(s?.current);
          if (voltageMv == null || currentMa == null) return null;
          return {
            t: now - (arr.length - 1 - i) * period,
            voltageMv,
            currentMa,
            powerW: round((voltageMv * currentMa) / 1e6, 3),
          };
        })
        .filter(Boolean);
      return {
        id,
        name: meta?.name || portName(id),
        type: meta?.type || portType(id),
        samples,
      };
    })
    .filter((p) => Number.isInteger(p.id))
    .sort((a, b) => a.id - b.id);
  return {
    ok: true,
    source: snapshot?.source || "metrics.json",
    host: host || snapshot?.host || null,
    fetchedAt: now,
    samplePeriodMs: period,
    endTs: now,
    ports,
  };
}
