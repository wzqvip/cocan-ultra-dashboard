/**
 * Zero-dependency canvas charting: power history + mini sparklines.
 * High-DPI aware, hover/touch tooltip, per-series visibility.
 */

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const fraction = value / base;
  const candidates = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const candidate of candidates) {
    if (fraction <= candidate) return candidate * base;
  }
  return 10 * base;
}

function scaleFor(maxValue) {
  const max = Math.max(0.1, Number.isFinite(maxValue) ? maxValue : 0);
  const target = max * 1.1;
  const step = niceStep(target / 5);
  const rows = Math.min(6, Math.max(3, Math.ceil(target / step)));
  return { step, rows, max: step * rows };
}

function nearestSample(samples, t) {
  if (!samples || samples.length === 0) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const after = samples[lo];
  const before = samples[Math.max(0, lo - 1)];
  if (!after) return before || null;
  if (!before) return after;
  return Math.abs(after.t - t) <= Math.abs(t - before.t) ? after : before;
}

export class PowerChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.parent = canvas.parentElement;
    this.ports = [];
    this.total = [];
    this.rangeMs = 30 * 60 * 1000;
    this.now = Date.now();
    this.visible = new Set(["total", 0, 1, 2, 3, 4]);
    this.hoverT = null;
    this.hoverX = null;
    this.hoverY = null;
    this.pointerDown = false;
    this.formatTime = options.formatTime || ((ts) => new Date(ts).toTimeString().slice(0, 5));
    this.formatPower = options.formatPower || ((w) => `${w.toFixed(1)} W`);
    this.labels = options.labels || { total: "Total" };
    this.w = 0;
    this.h = 0;
    this.dpr = 1;

    this.tooltip = document.createElement("div");
    this.tooltip.className = "chart-tip";
    this.tooltip.setAttribute("role", "presentation");
    if (this.parent) this.parent.appendChild(this.tooltip);

    this._onPointerMove = (event) => this.onPointerMove(event);
    this._onPointerDown = (event) => {
      this.pointerDown = true;
      this.onPointerMove(event);
    };
    this._onPointerUp = (event) => {
      this.pointerDown = false;
      if (event.pointerType !== "mouse") this.clearHover();
    };
    this._onPointerLeave = () => {
      if (!this.pointerDown) this.clearHover();
    };

    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointercancel", this._onPointerUp);
    canvas.addEventListener("pointerleave", this._onPointerLeave);

    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
        this.draw();
      });
      this.resizeObserver.observe(this.parent || canvas);
    }
    this.resize();
  }

  setLabels(labels) {
    this.labels = { ...this.labels, ...(labels || {}) };
  }

  setData({ ports, total, rangeMs, now, visible }) {
    this.ports = Array.isArray(ports) ? ports : [];
    this.total = Array.isArray(total) ? total : [];
    if (Number.isFinite(rangeMs)) this.rangeMs = rangeMs;
    this.now = Number.isFinite(now) ? now : Date.now();
    if (visible) this.visible = new Set([...visible].map(String));
    this.draw();
  }

  setVisible(ids) {
    this.visible = new Set([...ids].map(String));
    this.draw();
  }

  setFormatTime(fn) {
    if (typeof fn === "function") this.formatTime = fn;
  }

  setFormatPower(fn) {
    if (typeof fn === "function") this.formatPower = fn;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || 1));
    const height = Math.max(1, Math.round(rect.height || 1));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    this.w = width;
    this.h = height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  isVisible(id) {
    return this.visible.has(String(id));
  }

  visiblePorts() {
    return this.ports.filter((port) => this.isVisible(port.id));
  }

  windowSamples(samples) {
    if (!Array.isArray(samples)) return [];
    const min = this.now - this.rangeMs;
    return samples.filter((sample) => Number.isFinite(sample.t) && sample.t >= min && sample.t <= this.now);
  }

  maxInWindow() {
    let max = 0;
    if (this.isVisible("total")) {
      for (const sample of this.windowSamples(this.total)) {
        if (sample.powerW > max) max = sample.powerW;
      }
    }
    for (const port of this.visiblePorts()) {
      for (const sample of this.windowSamples(port.samples)) {
        if (sample.powerW > max) max = sample.powerW;
      }
    }
    return max;
  }

  clearHover() {
    this.hoverT = null;
    this.hoverX = null;
    this.hoverY = null;
    this.tooltip.classList.remove("is-visible");
    this.draw();
  }

  onPointerMove(event) {
    if (!this.w || !this.h) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const pad = this.plotPad();
    if (x < pad.left || x > this.w - pad.right || y < pad.top || y > this.h - pad.bottom) {
      if (!this.pointerDown) this.clearHover();
      return;
    }
    this.hoverX = x;
    this.hoverY = y;
    this.hoverT = this.now - this.rangeMs + ((x - pad.left) / Math.max(1, this.w - pad.left - pad.right)) * this.rangeMs;
    this.draw();
  }

  plotPad() {
    const compact = this.w < 400;
    return {
      left: compact ? 34 : 42,
      right: 12,
      top: 10,
      bottom: 22,
    };
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.w || !this.h) return;
    const pad = this.plotPad();
    const plotW = Math.max(1, this.w - pad.left - pad.right);
    const plotH = Math.max(1, this.h - pad.top - pad.bottom);
    const xMin = this.now - this.rangeMs;
    const xMax = this.now;

    const gridColor = cssVar("--chart-grid", "rgba(0,0,0,.08)");
    const axisColor = cssVar("--chart-axis", "#777");
    const totalColor = cssVar("--chart-total", "#b45309");
    const totalFill = cssVar("--chart-total-fill", "rgba(180,83,9,.12)");
    const surface = cssVar("--surface", "#fff");

    ctx.clearRect(0, 0, this.w, this.h);

    const scale = scaleFor(this.maxInWindow());
    const yMax = scale.max || 10;

    const toX = (t) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * plotW;
    const toY = (v) => pad.top + (1 - Math.min(v, yMax) / yMax) * plotH;

    /* Horizontal grid + y labels */
    ctx.font = '10px -apple-system, "Segoe UI", "PingFang SC", sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.lineWidth = 1;
    for (let i = 0; i <= scale.rows; i += 1) {
      const value = scale.step * i;
      const y = toY(value);
      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(pad.left, Math.round(y) + 0.5);
      ctx.lineTo(pad.left + plotW, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = axisColor;
      const label = value >= 100 || scale.step >= 1 ? String(Math.round(value)) : value.toFixed(1);
      ctx.fillText(`${label}`, pad.left - 6, y);
    }

    /* X labels */
    const tickCount = this.w < 380 ? 4 : 5;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= tickCount; i += 1) {
      const t = xMin + ((xMax - xMin) * i) / tickCount;
      const x = toX(t);
      ctx.fillStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, pad.top + plotH);
      ctx.lineTo(Math.round(x) + 0.5, pad.top + plotH + 3);
      ctx.stroke();
      ctx.fillStyle = axisColor;
      const align = i === 0 ? "left" : i === tickCount ? "right" : "center";
      ctx.textAlign = align;
      ctx.fillText(this.formatTime(t), x, pad.top + plotH + 5);
    }
    ctx.textAlign = "left";

    /* Series */
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    const drawSeries = (samples, color, width, fill) => {
      const visible = this.windowSamples(samples);
      if (visible.length === 0) return;
      const maxGap = Math.max(30000, this.rangeMs / 60);
      const path = new Path2D();
      let started = false;
      let prevT = 0;
      for (const sample of visible) {
        const x = toX(sample.t);
        const y = toY(sample.powerW || 0);
        if (!started || sample.t - prevT > maxGap) {
          path.moveTo(x, y);
          started = true;
        } else {
          path.lineTo(x, y);
        }
        prevT = sample.t;
      }
      if (fill) {
        const fillPath = new Path2D(path);
        const first = visible[0];
        const last = visible[visible.length - 1];
        fillPath.lineTo(toX(last.t), pad.top + plotH);
        fillPath.lineTo(toX(first.t), pad.top + plotH);
        fillPath.closePath();
        const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        gradient.addColorStop(0, fill);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fill(fillPath);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(path);
      if (visible.length === 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(toX(visible[0].t), toY(visible[0].powerW || 0), width + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (this.isVisible("total")) {
      drawSeries(this.total, totalColor, 2.4, totalFill);
    }
    for (const port of this.visiblePorts()) {
      drawSeries(port.samples, port.color || "#888", 1.7, null);
    }

    /* Hover crosshair + dots */
    if (this.hoverT !== null) {
      const hx = toX(this.hoverT);
      ctx.strokeStyle = axisColor;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, pad.top + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const seriesList = [];
      if (this.isVisible("total")) seriesList.push({ id: "total", samples: this.total, color: totalColor, name: this.labels.total });
      for (const port of this.visiblePorts()) {
        seriesList.push({ id: port.id, samples: port.samples, color: port.color, name: port.name });
      }
      const maxGap = Math.max(60000, this.rangeMs / 30);
      for (const series of seriesList) {
        const sample = nearestSample(series.samples, this.hoverT);
        if (!sample || Math.abs(sample.t - this.hoverT) > maxGap) continue;
        ctx.fillStyle = surface;
        ctx.beginPath();
        ctx.arc(toX(sample.t), toY(sample.powerW || 0), 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = series.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();

    /* Baseline */
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, Math.round(pad.top + plotH) + 0.5);
    ctx.lineTo(pad.left + plotW, Math.round(pad.top + plotH) + 0.5);
    ctx.stroke();

    if (this.hoverT !== null) this.renderTooltip();
  }

  renderTooltip() {
    if (!this.parent) return;
    const pad = this.plotPad();
    const seriesList = [];
    let nearestT = null;
    if (this.isVisible("total")) {
      const sample = nearestSample(this.total, this.hoverT);
      if (sample) {
        seriesList.push({ name: this.labels.total, color: cssVar("--chart-total", "#b45309"), value: sample.powerW });
        nearestT = sample.t;
      }
    }
    for (const port of this.visiblePorts()) {
      const sample = nearestSample(port.samples, this.hoverT);
      if (!sample) continue;
      seriesList.push({ name: port.name, color: port.color, value: sample.powerW });
      if (nearestT === null || Math.abs(sample.t - this.hoverT) < Math.abs(nearestT - this.hoverT)) {
        nearestT = sample.t;
      }
    }
    if (seriesList.length === 0) {
      this.tooltip.classList.remove("is-visible");
      return;
    }

    const fragment = document.createDocumentFragment();
    const timeEl = document.createElement("div");
    timeEl.className = "tip-time";
    timeEl.textContent = this.formatTime(nearestT ?? this.hoverT);
    fragment.appendChild(timeEl);
    for (const row of seriesList) {
      const rowEl = document.createElement("div");
      rowEl.className = "tip-row";
      const key = document.createElement("span");
      key.className = "tip-key";
      const dot = document.createElement("span");
      dot.className = "tip-dot";
      dot.style.background = row.color;
      const name = document.createElement("span");
      name.className = "tip-name";
      name.textContent = row.name;
      key.append(dot, name);
      const value = document.createElement("span");
      value.className = "tip-val";
      value.textContent = this.formatPower(Number(row.value) || 0);
      rowEl.append(key, value);
      fragment.appendChild(rowEl);
    }
    this.tooltip.replaceChildren(fragment);

    const tipWidth = this.tooltip.offsetWidth;
    const tipHeight = this.tooltip.offsetHeight;
    const pointerX = this.hoverX ?? pad.left;
    const pointerY = this.hoverY ?? pad.top;
    let left = pointerX + 14;
    if (left + tipWidth > this.w - 6) left = pointerX - tipWidth - 14;
    left = Math.max(6, Math.min(left, this.w - tipWidth - 6));
    let top = pointerY - tipHeight - 12;
    if (top < 4) top = pointerY + 16;
    top = Math.max(4, Math.min(top, this.h - tipHeight - 4));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
    this.tooltip.classList.add("is-visible");
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointercancel", this._onPointerUp);
    this.canvas.removeEventListener("pointerleave", this._onPointerLeave);
    this.tooltip.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                          */
/* ------------------------------------------------------------------ */

export function drawSparkline(canvas, samples, color, options = {}) {
  if (!canvas || !canvas.isConnected) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
  const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 1));
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const list = Array.isArray(samples) ? samples : [];
  if (list.length === 0) return;

  const maxGap = options.maxGapMs || 90000;
  const max = Math.max(0.1, ...list.map((sample) => sample.powerW || 0)) * 1.15;
  const padX = 2;
  const padY = 5;
  const plotW = Math.max(1, width - padX * 2);
  const plotH = Math.max(1, height - padY * 2);
  const tMin = list[0].t;
  const tMax = list[list.length - 1].t;
  const span = Math.max(1, tMax - tMin);

  const toX = (t) => padX + ((t - tMin) / span) * plotW;
  const toY = (v) => padY + (1 - Math.min(v, max) / max) * plotH;

  const path = new Path2D();
  let started = false;
  let prevT = 0;
  for (const sample of list) {
    const x = toX(sample.t);
    const y = toY(sample.powerW || 0);
    if (!started || sample.t - prevT > maxGap) {
      path.moveTo(x, y);
      started = true;
    } else {
      path.lineTo(x, y);
    }
    prevT = sample.t;
  }

  const gradient = ctx.createLinearGradient(0, padY, 0, padY + plotH);
  gradient.addColorStop(0, hexAlpha(color, 0.22));
  gradient.addColorStop(1, hexAlpha(color, 0));

  const fillPath = new Path2D(path);
  fillPath.lineTo(toX(tMax), padY + plotH);
  fillPath.lineTo(toX(tMin), padY + plotH);
  fillPath.closePath();
  ctx.fillStyle = gradient;
  ctx.fill(fillPath);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(path);
}

function hexAlpha(color, alpha) {
  if (typeof color !== "string") return `rgba(120,120,120,${alpha})`;
  const hex = color.trim();
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
