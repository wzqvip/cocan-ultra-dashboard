/**
 * Signature power-flow diagram (pure inline SVG, no images).
 *
 * Anatomy mirrors the official App "专业视图":
 *   5 port chips (fixed order A, C1..C4)
 *     → smooth bezier cables
 *     → charger body at the lower right (screen shows total W, slots, budget card)
 *
 * Three fixed viewBox layouts keep text readable at every size:
 *   roomy   620x352  (desktop / wide cards, App 1:1 proportions)
 *   compact 360x272  (phones / narrow tablets)
 *   squash  360x180  (landscape phones, short viewports)
 */

import { fmtVolts, portColor } from "./data.js";
import { getLang, t } from "./i18n.js";

const NS = "http://www.w3.org/2000/svg";

const LAYOUTS = {
  roomy: {
    viewBox: [620, 352],
    chip: { left: 37, top: 14, w: 100.8, h: 58, gap: 10.5, r: 10 },
    chipText: { nameX: 12, nameY: 17, dotR: 4, dotX: -12, dotY: 13, powerX: 12, powerY: 39, detailX: 12, detailY: 54 },
    lineStart: 72,
    slotY: 272,
    slotH: 9.5,
    slotW: { A: 26.6, C: 19 },
    slotRx: { A: 2, C: 4.75 },
    body: { x: 403.2, y: 199.8, w: 212.8, h: 110.2, r: 20.9 },
    screen: { x: 22.8, y: 18, w: 57, h: 26, r: 6 },
    budget: { x: 520, y: 296, w: 92, h: 52, r: 9 },
    status: { x: 0, y: 318 },
    brand: { x: 190, y: 20 },
    showStatus: true,
    showBrand: true,
    cableUnder: 7,
  },
  compact: {
    viewBox: [360, 272],
    chip: { left: 12, top: 8, w: 62.4, h: 58, gap: 6, r: 8 },
    chipText: { nameX: 8, nameY: 16, dotR: 3.4, dotX: -8, dotY: 12, powerX: 8, powerY: 37, detailX: 8, detailY: 51 },
    lineStart: 66,
    slotY: 244,
    slotH: 7,
    slotW: { A: 18, C: 13 },
    slotRx: { A: 1.5, C: 3.5 },
    body: { x: 230, y: 200, w: 118, h: 62, r: 13 },
    screen: { x: 10, y: 9, w: 48, h: 22, r: 5 },
    budget: { x: 12, y: 213, w: 104, h: 47, r: 10 },
    status: { x: 0, y: 0 },
    brand: { x: 130, y: 13 },
    showStatus: false,
    showBrand: false,
    cableUnder: 5,
  },
  squash: {
    viewBox: [360, 180],
    chip: { left: 12, top: 5, w: 62.4, h: 38, gap: 6, r: 7 },
    chipText: { nameX: 7, nameY: 13, dotR: 2.8, dotX: -7, dotY: 10, powerX: 7, powerY: 29, detailX: 7, detailY: 38 },
    lineStart: 43,
    slotY: 150,
    slotH: 6,
    slotW: { A: 16, C: 12 },
    slotRx: { A: 1.2, C: 3 },
    body: { x: 232, y: 120, w: 116, h: 42, r: 11 },
    screen: { x: 9, y: 7, w: 42, h: 19, r: 4.5 },
    budget: { x: 12, y: 128, w: 100, h: 30, r: 8 },
    status: { x: 0, y: 0 },
    brand: { x: 0, y: 0 },
    showStatus: false,
    showBrand: false,
    cableUnder: 4,
  },
};

const SHORT_PROTOCOL = {
  none: "未充电",
  usb: "USB",
  qc2: "QC2",
  qc3: "QC3",
  qc3p: "QC3+",
  sfcp: "SFCP",
  afc: "AFC",
  fcp: "FCP",
  scp: "SCP",
  vooc1: "VOOC",
  vooc4: "VOOC4",
  svooc2: "SVOOC",
  tfcp: "TFCP",
  ufcs: "UFCS",
  pe1: "PE1",
  pe2: "PE2",
  pd5v: "PD5V",
  pdhv: "PD",
  pd_spr_avs: "AVS",
  pps: "PPS",
  epr: "EPR",
  pd_avs: "AVS",
  not_charging: "未充电",
};

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    }
  }
  return node;
}

function fmtPowerNumber(watts) {
  if (!Number.isFinite(watts)) return { num: "—", unit: "" };
  const digits = watts >= 100 ? 0 : 1;
  return { num: watts.toFixed(digits), unit: "W" };
}

function compactVolts(mv) {
  if (!Number.isFinite(mv)) return "—";
  return `${(mv / 1000).toFixed(2).replace(/\.?0+$/, "")}V`;
}

function shortProtocol(port) {
  if (!port) return "";
  if (SHORT_PROTOCOL[port.protocol]) return SHORT_PROTOCOL[port.protocol];
  const label = port.protocolLabel || "";
  return label.length > 8 ? `${label.slice(0, 7)}…` : label || "—";
}

export function createDiagram(container, { onSelect, describe } = {}) {
  const svg = el("svg", {
    class: "diagram mode-roomy",
    role: "group",
    "aria-label": t("flowAria"),
    preserveAspectRatio: "xMidYMid meet",
  });

  const defs = el("defs");
  const bodyGrad = el("linearGradient", { id: "flowBodyGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
  const stopTop = el("stop", { offset: "0", class: "grad-body-top" });
  const stopBottom = el("stop", { offset: "1", class: "grad-body-bottom" });
  bodyGrad.append(stopTop, stopBottom);
  defs.append(bodyGrad);
  svg.append(defs);

  const cablesG = el("g", { class: "cables" });
  const bodyG = el("g", { class: "charger-body" });
  const chipsG = el("g", { class: "chips" });
  svg.append(cablesG, bodyG, chipsG);
  container.append(svg);

  /* ---------------------------------------------------------------- chips */
  const chips = new Map();
  for (let id = 0; id < 5; id += 1) {
    const g = el("g", {
      class: "chip is-idle",
      "data-port": id,
      role: "button",
      tabindex: "0",
      style: `--pc:${portColor(id)}`,
    });
    const accent = el("rect", { class: "chip-accent", x: 0, y: 0, width: 3, rx: 1.5 });
    const box = el("rect", { class: "chip-box", x: 0, y: 0, rx: 10 });
    const dot = el("circle", { class: "chip-dot" });
    const name = el("text", { class: "chip-name", "dominant-baseline": "alphabetic" });
    const power = el("text", { class: "chip-pwr" });
    const powerNum = el("tspan", { class: "chip-num" });
    const powerUnit = el("tspan", { class: "chip-unit" });
    power.append(powerNum, powerUnit);
    const detail = el("text", { class: "chip-detail" });
    g.append(accent, box, dot, name, power, detail);
    chipsG.append(g);

    const select = () => onSelect?.(id);
    g.addEventListener("click", select);
    g.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        select();
      }
    });
    g.addEventListener("focus", () => g.classList.add("is-focused"));
    g.addEventListener("blur", () => g.classList.remove("is-focused"));

    chips.set(id, { g, accent, box, dot, name, powerNum, powerUnit, detail });
  }

  /* --------------------------------------------------------------- cables */
  const cables = new Map();
  for (let id = 0; id < 5; id += 1) {
    const g = el("g", { class: "cable is-idle", "data-port": id, style: `--pc:${portColor(id)}` });
    const under = el("path", { class: "cable-under" });
    const main = el("path", { class: "cable-main" });
    const dash = el("path", { class: "cable-dash" });
    g.append(under, main, dash);
    cablesG.append(g);
    cables.set(id, { g, under, main, dash });
  }

  /* ----------------------------------------------------------- body parts */
  const bodyRect = el("rect", { class: "body-rect" });
  const bodyBrand = el("text", { class: "body-brand", "text-anchor": "end" });
  const screenRect = el("rect", { class: "screen-rect" });
  const screenLabel = el("text", { class: "screen-label", "text-anchor": "middle" });
  const screenNum = el("text", { class: "screen-num", "text-anchor": "middle" });
  const screenUnit = el("tspan", { class: "screen-unit" });
  const screenValue = el("tspan", { class: "screen-value" });
  screenNum.append(screenValue, screenUnit);

  const slots = [];
  for (let id = 0; id < 5; id += 1) {
    const slot = el("rect", { class: "slot", "data-port": id });
    slots.push(slot);
    bodyG.append(slot);
  }

  const budgetGroup = el("g", { class: "budget-card" });
  const budgetRect = el("rect", { class: "budget-rect" });
  const budgetNum = el("text", { class: "budget-num", "text-anchor": "middle" });
  const budgetNumValue = el("tspan", { class: "budget-value" });
  const budgetUnit = el("tspan", { class: "budget-unit" });
  budgetNum.append(budgetNumValue, budgetUnit);
  const budgetSub = el("text", { class: "budget-sub", "text-anchor": "middle" });
  budgetGroup.append(budgetRect, budgetNum, budgetSub);

  const statusText = el("text", { class: "status-detail" });

  bodyG.prepend(bodyRect);
  bodyG.append(bodyBrand, screenRect, screenLabel, screenNum, budgetGroup, statusText);

  /* ------------------------------------------------------------- geometry */
  let mode = null;
  let snapshot = null;
  let selected = null;

  function applyLayout(nextMode) {
    mode = nextMode;
    const L = LAYOUTS[mode];
    svg.setAttribute("viewBox", `0 0 ${L.viewBox[0]} ${L.viewBox[1]}`);
    svg.setAttribute("class", `diagram mode-${mode}`);

    /* chips */
    const chipW = L.chip.w;
    for (let id = 0; id < 5; id += 1) {
      const chip = chips.get(id);
      const x = L.chip.left + id * (chipW + L.chip.gap);
      const top = L.chip.top;
      chip.g.setAttribute("transform", `translate(${x.toFixed(2)} ${top})`);
      chip.accent.setAttribute("x", 0);
      chip.accent.setAttribute("y", 0);
      chip.accent.setAttribute("height", L.chip.h);
      chip.accent.setAttribute("rx", 1.5);
      chip.box.setAttribute("width", chipW);
      chip.box.setAttribute("height", L.chip.h);
      chip.box.setAttribute("rx", L.chip.r);
      chip.dot.setAttribute("cx", chipW + L.chipText.dotX);
      chip.dot.setAttribute("cy", L.chipText.dotY);
      chip.dot.setAttribute("r", L.chipText.dotR);
      chip.name.setAttribute("x", L.chipText.nameX);
      chip.name.setAttribute("y", L.chipText.nameY);
      chip.powerNum.setAttribute("x", L.chipText.powerX);
      chip.powerNum.setAttribute("y", L.chipText.powerY);
      chip.powerUnit.removeAttribute("x");
      chip.powerUnit.removeAttribute("y");
      chip.powerUnit.setAttribute("dx", "2");
      chip.detail.setAttribute("x", L.chipText.detailX);
      chip.detail.setAttribute("y", L.chipText.detailY);
    }

    /* body + slots */
    const B = L.body;
    bodyRect.setAttribute("x", B.x);
    bodyRect.setAttribute("y", B.y);
    bodyRect.setAttribute("width", B.w);
    bodyRect.setAttribute("height", B.h);
    bodyRect.setAttribute("rx", B.r);

    const bodyX = B.x;
    const bodyY = B.y;
    const screen = L.screen;
    screenRect.setAttribute("x", bodyX + screen.x);
    screenRect.setAttribute("y", bodyY + screen.y);
    screenRect.setAttribute("width", screen.w);
    screenRect.setAttribute("height", screen.h);
    screenRect.setAttribute("rx", screen.r);
    const screenCx = bodyX + screen.x + screen.w / 2;
    screenLabel.setAttribute("x", screenCx);
    screenLabel.setAttribute("y", bodyY + screen.y + screen.h * 0.34);
    screenNum.setAttribute("x", screenCx);
    screenNum.setAttribute("y", bodyY + screen.y + screen.h * 0.8);

    bodyBrand.setAttribute("x", bodyX + B.w - (mode === "roomy" ? 22 : 12));
    bodyBrand.setAttribute("y", bodyY + L.brand.y);

    const centers = [];
    const inset = mode === "roomy" ? 18 : 16;
    const usable = B.w - inset * 2;
    for (let id = 0; id < 5; id += 1) {
      const cx = bodyX + inset + (usable / 4) * id;
      centers.push(cx);
      const isA = id === 0;
      const w = isA ? L.slotW.A : L.slotW.C;
      const slot = slots[id];
      slot.setAttribute("x", cx - w / 2);
      slot.setAttribute("y", L.slotY);
      slot.setAttribute("width", w);
      slot.setAttribute("height", L.slotH);
      slot.setAttribute("rx", isA ? L.slotRx.A : L.slotRx.C);
    }

    /* cables */
    const dy = L.slotY - L.lineStart;
    for (let id = 0; id < 5; id += 1) {
      const x1 = L.chip.left + id * (chipW + L.chip.gap) + chipW / 2;
      const x2 = centers[id];
      const y1 = L.lineStart;
      const y2 = L.slotY;
      const c1 = y1 + dy * 0.62;
      const c2 = y2 - dy * 0.55;
      const d = `M ${x1.toFixed(2)} ${y1} C ${x1.toFixed(2)} ${c1.toFixed(2)} ${x2.toFixed(2)} ${c2.toFixed(2)} ${x2.toFixed(2)} ${y2}`;
      const cable = cables.get(id);
      cable.under.setAttribute("d", d);
      cable.main.setAttribute("d", d);
      cable.dash.setAttribute("d", d);
    }

    /* budget card */
    budgetGroup.setAttribute("transform", `translate(${L.budget.x} ${L.budget.y})`);
    budgetRect.setAttribute("width", L.budget.w);
    budgetRect.setAttribute("height", L.budget.h);
    budgetRect.setAttribute("rx", L.budget.r);
    budgetNum.setAttribute("x", L.budget.w / 2);
    budgetNum.setAttribute("y", mode === "roomy" ? 25 : mode === "compact" ? 21 : 17);
    budgetSub.setAttribute("x", L.budget.w / 2);
    budgetSub.setAttribute("y", mode === "roomy" ? 42 : mode === "compact" ? 36 : 26);

    statusText.setAttribute("x", L.status.x);
    statusText.setAttribute("y", L.status.y);
  }

  function applyMode() {
    const width = container.clientWidth || 360;
    const shortLandscape =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(orientation: landscape) and (max-height: 560px)").matches;
    const next = shortLandscape ? "squash" : width < 560 ? "compact" : "roomy";
    if (next !== mode) applyLayout(next);
  }

  /* --------------------------------------------------------------- update */
  function update(nextSnapshot, options = {}) {
    if (nextSnapshot !== undefined) snapshot = nextSnapshot;
    if (options.selected !== undefined) selected = options.selected;

    const ports = Array.isArray(snapshot?.ports) ? snapshot.ports : [];
    const total = Number.isFinite(snapshot?.totals?.powerW) ? snapshot.totals.powerW : NaN;
    const budget =
      Number(snapshot?.totals?.budgetW) ||
      Number(snapshot?.device?.maxPowerW) ||
      160;
    const utilization = Number.isFinite(snapshot?.totals?.utilization)
      ? snapshot.totals.utilization
      : Number.isFinite(total)
        ? (total / budget) * 100
        : NaN;

    const selectedId =
      selected === null || selected === undefined || selected === "" ? NaN : Number(selected);

    for (let id = 0; id < 5; id += 1) {
      const port = ports.find((p) => Number(p.id) === id) || null;
      const chip = chips.get(id);
      const cable = cables.get(id);
      const charging = Boolean(port && port.attached && (port.powerW || 0) >= 0.1 && port.active !== false);
      const inactive = Boolean(port && port.active === false);
      const idle = !port || !port.attached || inactive;

      const power = port ? Number(port.powerW) : NaN;
      const { num, unit } = port ? fmtPowerNumber(power) : { num: "—", unit: "" };
      chip.powerNum.textContent = num;
      chip.powerUnit.textContent = unit;
      chip.name.textContent = port?.name || (id === 0 ? "A" : `C${id}`);
      chip.dot.style.fill = portColor(id);

      if (port && !idle) {
        chip.detail.textContent = `${compactVolts(port.voltageMv)} · ${shortProtocol(port)}`;
      } else if (inactive) {
        chip.detail.textContent = t("stateInactive");
      } else {
        chip.detail.textContent = t("stateIdle");
      }

      chip.g.classList.toggle("is-charging", charging);
      chip.g.classList.toggle("is-idle", idle);
      chip.g.classList.toggle("is-off", inactive);
      chip.g.classList.toggle("is-selected", selectedId === id);
      chip.g.setAttribute(
        "aria-label",
        describe ? describe(port, id) : `${port?.name || id} ${num}${unit}`,
      );

      cable.g.classList.toggle("is-charging", charging);
      cable.g.classList.toggle("is-idle", idle);
      cable.g.classList.toggle("is-attached", Boolean(port?.attached) && !charging);
    }

    screenValue.textContent = Number.isFinite(total) ? String(Math.round(total)) : "—";
    screenUnit.textContent = Number.isFinite(total) ? "W" : "";
    screenLabel.textContent = t("flowScreenLabel");

    budgetNumValue.textContent = String(Math.round(budget));
    budgetUnit.textContent = " W";
    budgetSub.textContent = Number.isFinite(utilization)
      ? t("budgetUsed", { pct: utilization.toFixed(0) })
      : "—";

    if (mode === "roomy") {
      const chargingCount = snapshot?.totals?.chargingCount;
      const energyAvailable = snapshot?.capabilities?.energy !== false;
      const energy = energyAvailable ? snapshot?.totals?.sessionWh : null;
      const remaining = Number.isFinite(total) ? Math.max(0, budget - total) : NaN;
      const energyText = energyAvailable
        ? `${Number(energy || 0).toFixed(2)} Wh`
        : "—";
      const remainingText = Number.isFinite(remaining) ? `${Math.round(remaining)} W` : "—";
      statusText.textContent = t("flowStatus", {
        charging: Number.isFinite(chargingCount) ? chargingCount : 0,
        total: 5,
        energy: energyText,
        remaining: remainingText,
      });
    } else {
      statusText.textContent = "";
    }

    bodyBrand.textContent = mode === "roomy" ? "CANDYSIGN" : "";
  }

  function destroy() {
    resizeObserver?.disconnect();
    mediaQuery?.removeEventListener?.("change", applyMode);
    svg.remove();
  }

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => applyMode())
      : null;
  if (resizeObserver) resizeObserver.observe(container);

  const mediaQuery =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(orientation: landscape) and (max-height: 560px)")
      : null;
  if (mediaQuery?.addEventListener) mediaQuery.addEventListener("change", applyMode);

  applyMode();
  /* Populate initial idle chips so the diagram is never empty. */
  update(snapshot);

  return {
    update,
    refreshLabels: () => {
      svg.setAttribute("aria-label", t("flowAria"));
      update(snapshot, { selected });
    },
    destroy,
    svg,
  };
}
