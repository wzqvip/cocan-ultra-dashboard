/**
 * Demo data generator — same shape as docs/DATA-CONTRACT.md.
 * Used by GitHub Pages (no device) and `?demo=1`.
 * Contains NO real PSN / MAC / SSID / IP.
 */

import { decodeProtocol, portName, portType } from "./protocols.js";

const EPOCH = Date.UTC(2026, 0, 1);
const CYCLE_MS = 120000;
const SESSION_CHARGE_UNIT_UWS = 24.552;

const PHASES = [
  {
    start: 0,
    // 笔记本 65W + 手机 18W + 耳机 2.1W
    ports: {
      1: { v: 20000, i: 3250, p: 16 },
      2: { v: 9000, i: 2000, p: 16 },
      3: { v: 5000, i: 420, p: 15 },
    },
  },
  {
    start: 40000,
    // 笔记本 45W + 手机 22.5W + 平板 27W
    ports: {
      1: { v: 20000, i: 2250, p: 16 },
      2: { v: 9000, i: 2500, p: 16 },
      4: { v: 15000, i: 1800, p: 16 },
    },
  },
  {
    start: 75000,
    // 高负载：笔记本 60W + 手机 PPS 28.6W + 平板 44W ≈ 132W
    ports: {
      1: { v: 20000, i: 3000, p: 16 },
      2: { v: 11000, i: 2600, p: 18 },
      4: { v: 20000, i: 2200, p: 16 },
    },
  },
  {
    start: 95000,
    // 回到第一组，演示收敛
    ports: {
      1: { v: 20000, i: 3250, p: 16 },
      2: { v: 9000, i: 2000, p: 16 },
      3: { v: 5000, i: 420, p: 15 },
    },
  },
];

const DEMO_DEVICE = {
  psn: "CP02-DEMO-0001",
  name: "CP02-DEMO",
  model: "pro",
  family: "CP02",
  modelLabel: "AI 小电拼 Pro（CP-02）",
  color: "white",
  hwRev: "MP0",
  esp32Version: "2.2.0",
  mcuVersion: "0.3.36",
  fpgaVersion: "0.2.9",
  zrlibVersion: "1.8.1",
  country: "US",
  mdnsHostname: "cp02-demo.local",
  bleMac: "02:00:00:00:00:23",
  wifiMac: "02:00:00:00:00:22",
  maxPowerW: 160,
  portMaxW: [60, 140, 140, 140, 140],
};

function positiveMod(n, m) {
  return ((n % m) + m) % m;
}

function phaseAt(now) {
  const elapsed = positiveMod(now - EPOCH, CYCLE_MS);
  let idx = 0;
  for (let i = 0; i < PHASES.length; i += 1) {
    if (elapsed >= PHASES[i].start) idx = i;
  }
  const phase = PHASES[idx];
  const next = idx + 1 < PHASES.length ? PHASES[idx + 1].start : CYCLE_MS;
  return { phase, phaseElapsed: Math.max(0, elapsed - phase.start), phaseEnd: next };
}

function round(n, digits = 3) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function demoPort(id, spec, now, phaseElapsed) {
  const attached = Boolean(spec);
  const protocol = decodeProtocol(attached ? spec.p : 255);
  let voltageMv = attached ? spec.v : 0;
  let currentMa = attached ? spec.i : 0;
  let powerW = 0;
  let chargingSeconds = null;
  let sessionWh = null;
  let sessionChargeRaw = null;
  if (attached) {
    const wobble =
      1 +
      0.012 * Math.sin(now / 1700 + id * 1.7) +
      0.008 * Math.sin(now / 4700 + id * 0.9);
    voltageMv = Math.round(spec.v + 5 * Math.sin(now / 900 + id));
    currentMa = Math.max(0, Math.round(spec.i * wobble));
    powerW = round((voltageMv * currentMa) / 1e6, 3);
    chargingSeconds = Math.round(phaseElapsed / 1000) + 25;
    sessionWh = round((powerW * chargingSeconds) / 3600, 4);
    sessionChargeRaw = Math.round((sessionWh * 3.6e9) / SESSION_CHARGE_UNIT_UWS);
  }
  const state = attached ? "ATTACHED" : "ACTIVE";
  return {
    id,
    name: portName(id),
    type: portType(id),
    active: true,
    attached,
    state,
    stateLabel: attached ? (powerW >= 0.1 ? "充电中" : "已连接") : "空闲",
    stateTone: attached ? (powerW >= 0.1 ? "charging" : "attached") : "idle",
    voltageMv,
    currentMa,
    powerW,
    protocolCode: protocol.code,
    protocol: protocol.key,
    protocolLabel: protocol.label,
    protocolFamily: protocol.family,
    chargingSeconds,
    sessionId: attached ? 6 : 0,
    sessionChargeRaw,
    sessionWh,
    vinMv: 29800,
    powerBudgetW: attached ? 140 : 0,
    pdStatus: null,
  };
}

function demoDevice(index) {
  const n = index + 1;
  const isUltra = index === 1;
  return {
    ...DEMO_DEVICE,
    model: isUltra ? "ultra" : "pro",
    modelLabel: isUltra ? "AI 小电拼 Ultra（CP-02）" : "AI 小电拼 Pro（CP-02）",
    psn: `CP02-DEMO-000${n}`,
    name: `CP02-DEMO-0${n}`,
    mdnsHostname: `cp02-demo${n}.local`,
    bleMac: `02:00:00:00:0${n}:23`,
    wifiMac: `02:00:00:00:0${n}:22`,
    portMaxW: DEMO_DEVICE.portMaxW.slice(),
  };
}

export function demoSnapshot(now = Date.now(), options = {}) {
  const index = Math.max(0, Number(options.index) || 0);
  const shifted = now - index * 13000;
  const { phase, phaseElapsed } = phaseAt(shifted);
  const ports = [];
  for (let id = 0; id <= 4; id += 1) {
    ports.push(demoPort(id, phase.ports[id], shifted, phaseElapsed));
  }
  const powerW = round(
    ports.reduce((sum, p) => sum + p.powerW, 0),
    2,
  );
  const attachedCount = ports.filter((p) => p.attached).length;
  const sessionWh = round(
    ports.reduce((sum, p) => sum + (p.sessionWh || 0), 0),
    3,
  );
  const uptimeSeconds = 3 * 86400 + 4 * 3600 + 12 * 60 + 37 + index * 1907;
  return {
    ok: true,
    source: "demo",
    host: `demo-${index + 1}.local`,
    fetchedAt: now,
    latencyMs: 0,
    mode: "demo",
    warnings: ["演示数据 · 不对应真实设备"],
    device: demoDevice(index),
    system: {
      chip: "esp32c3",
      cores: 1,
      cpuFreqMhz: 160,
      idfVersion: "v5.5.3",
      appVersion: "2.2.0",
      uptimeSeconds,
      bootTimeSeconds: uptimeSeconds,
      resetReason: 3,
      resetReasonLabel: "软件复位",
      freeHeap: Math.round(41000 + 900 * Math.sin(now / 7000 + index)),
      tasks: null,
    },
    wifi: {
      ssid: `DEMO-2.4G-${index + 1}`,
      bssid: `02:00:00:00:0${index + 1}:03`,
      channel: index === 0 ? 6 : 11,
      rssi: Math.round(-47 - index * 4 + 2 * Math.sin(now / 9000)),
    },
    ports,
    totals: {
      powerW,
      attachedCount,
      chargingCount: ports.filter((p) => p.attached && p.powerW >= 0.1).length,
      sessionWh,
      budgetW: 160,
      utilization: round((powerW / 160) * 100, 1),
      inputVoltageV: round(29.8 + 0.05 * Math.sin(now / 4000 + index), 2),
    },
    capabilities: {
      energy: true,
      deviceInfo: true,
      pd: false,
      temperature: false,
      prometheus: false,
    },
  };
}

export function demoSnapshots(now = Date.now(), count = 1) {
  const n = Math.max(1, Math.min(Number(count) || 1, 6));
  return Array.from({ length: n }, (_, index) => demoSnapshot(now, { index }));
}

export function demoHistory(now = Date.now(), limit = 180, options = {}) {
  const index = Math.max(0, Number(options.index) || 0);
  const count = Math.max(2, Math.min(Number(limit) || 180, 720));
  const period = 10000;
  const ports = [0, 1, 2, 3, 4].map((id) => ({
    id,
    name: portName(id),
    type: portType(id),
    samples: [],
  }));
  for (let i = count - 1; i >= 0; i -= 1) {
    const t = now - i * period;
    const snap = demoSnapshot(t, { index });
    for (const port of snap.ports) {
      const target = ports[port.id];
      if (!target) continue;
      target.samples.push({
        t,
        voltageMv: port.voltageMv,
        currentMa: port.currentMa,
        powerW: port.powerW,
      });
    }
  }
  return {
    ok: true,
    source: "demo",
    host: `demo-${index + 1}.local`,
    fetchedAt: now,
    samplePeriodMs: period,
    endTs: now,
    ports,
  };
}
