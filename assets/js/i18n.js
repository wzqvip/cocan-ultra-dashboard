/**
 * Tiny zero-dependency i18n layer.
 * Chinese is the primary language; English is a best-effort secondary UI.
 * Static markup uses data-i18n / data-i18n-aria / data-i18n-title /
 * data-i18n-placeholder attributes, dynamic strings call t().
 */

const DICT = {
  zh: {
    appTitle: "AI 小电拼 Pro / Ultra · 实时看板",
    skipLink: "跳到主要内容",
    statusLoading: "连接中",
    statusLive: "实时",
    statusDemo: "演示",
    statusStale: "数据过期",
    statusOffline: "离线",
    statusSetup: "未配置",
    toggleTheme: "切换主题",
    switchLang: "切换语言",
    openSettings: "设置",
    refresh: "刷新",

    totalPower: "实时总功率",
    updatedAt: "更新于 {time}",
    budgetOf: "标称 {budget} W",
    portsLabel: "端口",
    portCount: "{n} 口",
    portsValue: "{attached} 连接 · {charging} 充电",
    sessionEnergy: "本次电量",
    inputVoltage: "输入电压",
    uptime: "运行时长",

    flowTitle: "功率流向",
    flowSub: "点击端口查看详情",
    flowAria: "功率流向图，五个端口连接到充电器",
    screenTotal: "总输出",
    budgetChip: "标称 {w} W",
    budgetUsed: "已使用 {pct}%",
    flowScreenLabel: "总输出",
    flowStatus: "充电中 {charging}/{total} 口 · 本次累计 {energy} · 剩余 {remaining}",
    estimated: "估算",
    energyTip: "由原始计数换算，误差约 ±5%",

    chartTitle: "功率曲线",
    chartSub5m: "最近 5 分钟",
    chartSub30m: "最近 30 分钟",
    chartSub2h: "最近 2 小时",
    range5m: "5 分钟",
    range30m: "30 分钟",
    range2h: "2 小时",
    chartRangeLabel: "时间范围",
    chartEmpty: "暂无历史数据",
    chartLoading: "数据加载中…",
    chartTotal: "总功率",
    legendAria: "切换 {name} 曲线",

    portsTitle: "端口明细",
    portsSub: "每口实时功率、协议与本次电量",
    portAria: "{name}，{power}，{state}。查看详情",
    stateCharging: "充电中",
    stateAttachedIdle: "已连接 · 未取电",
    stateIdle: "空闲",
    stateInactive: "已关闭",
    stateOverTempWarn: "过温警告",
    stateOverTempAlert: "过温告警",
    stateCooling: "降温中",
    stateLimitedPower: "限功率",
    stateDead: "不可用",
    stateBooting: "启动中",
    stateChecking: "检测中",
    stateRecovering: "恢复中",
    stateDetaching: "断开中",
    stateOpening: "开启中",
    stateClosing: "关闭中",
    portTypeA: "USB-A",
    portTypeC: "USB-C",

    systemTitle: "设备与系统",
    systemSub: "芯片、固件、网络与数据源",
    sysDevice: "设备",
    sysFirmware: "固件",
    sysSystem: "系统",
    sysWifi: "网络",
    sysSource: "数据源",
    labelPsn: "PSN",
    labelModel: "型号",
    labelColor: "配色",
    labelHw: "硬件版本",
    labelHost: "地址",
    labelApp: "应用",
    labelEsp32: "ESP32",
    labelMcu: "MCU",
    labelFpga: "FPGA",
    labelZrlib: "ZRLib",
    labelChip: "芯片",
    labelCores: "核心",
    labelCpu: "主频",
    labelIdf: "IDF",
    labelFreeHeap: "空闲堆",
    labelReset: "复位原因",
    labelSsid: "SSID",
    labelRssi: "信号",
    labelChannel: "信道",
    labelBssid: "BSSID",
    labelLatency: "延迟",
    labelUpdated: "更新",
    labelEndpoint: "端点",
    sourceJson: "metrics.json",
    sourceProm: "Prometheus",
    sourceDemo: "演示数据",
    promNote: "Prometheus 模式不提供累计电量与充电时长，相关字段显示为 —。",
    energyUnavailable: "该数据源不提供",

    settingsTitle: "设置",
    deviceHost: "设备地址",
    hostHint: "支持 mDNS 名称或内网 IP；留空使用服务器默认设备。",
    hostPlaceholder: "cp02-xxxx.local 或 192.168.1.20",
    dataSource: "数据源",
    sourceAuto: "自动（优先 metrics.json）",
    pollInterval: "刷新间隔",
    intervalValue: "{s} 秒",
    theme: "主题",
    themeAuto: "跟随系统",
    themeLight: "浅色",
    themeDark: "深色",
    language: "语言",
    langZh: "中文",
    langEn: "English",
    testConn: "测试连接",
    testing: "正在连接…",
    scanLan: "扫描局域网",
    scanning: "扫描中…",
    scanResults: "发现设备",
    scanEmpty: "未发现设备",
    scanProxyMissing: "扫描需要本地代理 server.mjs。",
    scanPick: "使用",
    save: "保存",
    cancel: "取消",
    reset: "恢复默认",
    close: "关闭",
    testOk: "已连接 · {source} · {ms} ms · 当前 {power}",
    testNoDevice: "未检测到设备。先运行 node server.mjs --host <设备地址>，或扫描局域网。",
    testProxyMissing: "无法连接本地代理。请通过 node server.mjs 打开页面。",
    urlHostNote: "当前 URL 的 ?host= 参数优先于这里的设置。",
    noDeviceHint: "先运行 node server.mjs --host cp02-xxxx.local，或扫描局域网。",
    scanSubnets: "已扫描 {n} 个网段",
    scanDeviceMeta: "{ip} · PSN {psn}",

    setupTitle: "还没有连接到充电器",
    setupBody: "启动本地代理并指定设备地址，或在设置里扫描局域网。",
    setupStep1: "启动代理",
    setupStep2: "打开设置并扫描局域网",
    setupDemo: "先看演示数据",
    setupGuide: "设备地址可以从路由器后台或 mDNS 名称获得。",

    demoBannerTitle: "演示模式",
    demoBannerText: "数据由本地生成，不对应真实设备。",
    demoExit: "退出演示",
    offlineTitle: "设备离线",
    offlineText: "显示最后一次成功数据（{time}）。",
    staleTitle: "数据已过期",
    staleText: "最后更新于 {time}，设备或代理可能无响应。",
    offlineNoData: "无法获取设备数据。",
    proxyMissingTitle: "未检测到本地代理",
    proxyMissingText: "当前页面没有 /api 接口。运行 node server.mjs 后打开 http://127.0.0.1:8787，或使用演示数据。",
    retry: "重试",
    enterDemo: "进入演示",
    lastGoodTime: "最后成功 {time}",
    warningsTitle: "提示",

    portDetail: "端口详情",
    voltage: "电压",
    current: "电流",
    power: "功率",
    protocol: "协议",
    chargeTime: "充电时长",
    portLimit: "端口上限",
    firmwareState: "固件状态",
    last30m: "最近 30 分钟",
    sparkMeta: "{count} 点 · 峰值 {peak}",
    noHistory: "暂无历史",
    liveAnnounce: "总功率 {power}，{charging} 个端口充电中",
    footerNote: "非官方项目 · 数据来自设备本地接口",
    footerDemo: "演示数据",
    unknownProtocol: "未知 ({code})",
    capacityUnavailable: "该数据源不提供",
  },
  en: {
    appTitle: "AI Power Strip Pro / Ultra · Live dashboard",
    skipLink: "Skip to main content",
    statusLoading: "Connecting",
    statusLive: "Live",
    statusDemo: "Demo",
    statusStale: "Stale",
    statusOffline: "Offline",
    statusSetup: "Set up",
    toggleTheme: "Toggle theme",
    switchLang: "Switch language",
    openSettings: "Settings",
    refresh: "Refresh",

    totalPower: "Live total power",
    updatedAt: "Updated {time}",
    budgetOf: "Nominal {budget} W",
    portsLabel: "Ports",
    portCount: "{n} ports",
    portsValue: "{attached} attached · {charging} charging",
    sessionEnergy: "Session energy",
    inputVoltage: "Input voltage",
    uptime: "Uptime",

    flowTitle: "Power flow",
    flowSub: "Select a port for details",
    flowAria: "Power flow diagram: five ports feeding the charger",
    screenTotal: "Total out",
    budgetChip: "Nominal {w} W",
    budgetUsed: "{pct}% used",
    flowScreenLabel: "Total",
    flowStatus: "Charging {charging}/{total} · session {energy} · {remaining} left",
    estimated: "est.",
    energyTip: "Converted from raw counts, ±5%",

    chartTitle: "Power history",
    chartSub5m: "Last 5 minutes",
    chartSub30m: "Last 30 minutes",
    chartSub2h: "Last 2 hours",
    range5m: "5 min",
    range30m: "30 min",
    range2h: "2 h",
    chartRangeLabel: "Time range",
    chartEmpty: "No history yet",
    chartLoading: "Loading history…",
    chartTotal: "Total",
    legendAria: "Toggle {name} line",

    portsTitle: "Ports",
    portsSub: "Live power, protocol and session energy per port",
    portAria: "{name}, {power}, {state}. View details.",
    stateCharging: "Charging",
    stateAttachedIdle: "Connected · idle",
    stateIdle: "Idle",
    stateInactive: "Disabled",
    stateOverTempWarn: "Over-temperature",
    stateOverTempAlert: "Over-temperature alert",
    stateCooling: "Cooling",
    stateLimitedPower: "Power limited",
    stateDead: "Unavailable",
    stateBooting: "Booting",
    stateChecking: "Checking",
    stateRecovering: "Recovering",
    stateDetaching: "Detaching",
    stateOpening: "Opening",
    stateClosing: "Closing",
    portTypeA: "USB-A",
    portTypeC: "USB-C",

    systemTitle: "Device & system",
    systemSub: "Chip, firmware, network and data source",
    sysDevice: "Device",
    sysFirmware: "Firmware",
    sysSystem: "System",
    sysWifi: "Network",
    sysSource: "Data source",
    labelPsn: "PSN",
    labelModel: "Model",
    labelColor: "Color",
    labelHw: "Hardware",
    labelHost: "Host",
    labelApp: "App",
    labelEsp32: "ESP32",
    labelMcu: "MCU",
    labelFpga: "FPGA",
    labelZrlib: "ZRLib",
    labelChip: "Chip",
    labelCores: "Cores",
    labelCpu: "CPU",
    labelIdf: "IDF",
    labelFreeHeap: "Free heap",
    labelReset: "Reset reason",
    labelSsid: "SSID",
    labelRssi: "Signal",
    labelChannel: "Channel",
    labelBssid: "BSSID",
    labelLatency: "Latency",
    labelUpdated: "Updated",
    labelEndpoint: "Endpoint",
    sourceJson: "metrics.json",
    sourceProm: "Prometheus",
    sourceDemo: "Demo data",
    promNote: "Prometheus mode does not expose session energy or charge time; those fields show —.",
    energyUnavailable: "Not provided by this source",

    settingsTitle: "Settings",
    deviceHost: "Device address",
    hostHint: "mDNS name or LAN IP. Leave empty to use the server default.",
    hostPlaceholder: "cp02-xxxx.local or 192.168.1.20",
    dataSource: "Data source",
    sourceAuto: "Auto (prefer metrics.json)",
    pollInterval: "Refresh interval",
    intervalValue: "{s} s",
    theme: "Theme",
    themeAuto: "System",
    themeLight: "Light",
    themeDark: "Dark",
    language: "Language",
    langZh: "中文",
    langEn: "English",
    testConn: "Test connection",
    testing: "Connecting…",
    scanLan: "Scan LAN",
    scanning: "Scanning…",
    scanResults: "Devices found",
    scanEmpty: "No devices found",
    scanProxyMissing: "LAN scan needs the local server.mjs proxy.",
    scanPick: "Use",
    save: "Save",
    cancel: "Cancel",
    reset: "Reset",
    close: "Close",
    testOk: "Connected · {source} · {ms} ms · now {power}",
    testNoDevice: "No device found. Start node server.mjs --host <address>, or scan the LAN below.",
    testProxyMissing: "Cannot reach the local proxy. Open the page via node server.mjs.",
    urlHostNote: "The ?host= URL parameter overrides this setting.",
    noDeviceHint: "Start node server.mjs --host cp02-xxxx.local, or scan the LAN.",
    scanSubnets: "Scanned {n} subnets",
    scanDeviceMeta: "{ip} · PSN {psn}",

    setupTitle: "No charger connected yet",
    setupBody: "Start the local proxy with your device address, or scan the LAN from settings.",
    setupStep1: "Start the proxy",
    setupStep2: "Open settings and scan the LAN",
    setupDemo: "Explore demo data",
    setupGuide: "The device address is shown in your router or via its mDNS name.",

    demoBannerTitle: "Demo mode",
    demoBannerText: "Data is generated locally and does not describe a real device.",
    demoExit: "Exit demo",
    offlineTitle: "Device offline",
    offlineText: "Showing the last good data ({time}).",
    staleTitle: "Data is stale",
    staleText: "Last update {time}; the device or proxy may be unresponsive.",
    offlineNoData: "Unable to load device data.",
    proxyMissingTitle: "Local proxy not found",
    proxyMissingText: "This page has no /api endpoint. Run node server.mjs and open http://127.0.0.1:8787, or use demo data.",
    retry: "Retry",
    enterDemo: "Enter demo",
    lastGoodTime: "Last good {time}",
    warningsTitle: "Notice",

    portDetail: "Port details",
    voltage: "Voltage",
    current: "Current",
    power: "Power",
    protocol: "Protocol",
    chargeTime: "Charge time",
    portLimit: "Port limit",
    firmwareState: "Firmware state",
    last30m: "Last 30 minutes",
    sparkMeta: "{count} points · peak {peak}",
    noHistory: "No history",
    liveAnnounce: "Total {power}, {charging} ports charging",
    footerNote: "Unofficial project · data from the device's local API",
    footerDemo: "Demo data",
    unknownProtocol: "Unknown ({code})",
    capacityUnavailable: "Not provided by this source",
  },
};

const PROTOCOL_EN = {
  none: "Not charging",
  qc2: "QC2.0",
  qc3: "QC3.0",
  qc3p: "QC3+",
  sfcp: "SFCP",
  afc: "AFC",
  fcp: "FCP",
  scp: "SCP",
  vooc1: "VOOC 1.0",
  vooc4: "VOOC 4.0",
  svooc2: "SuperVOOC 2.0",
  tfcp: "TFCP",
  ufcs: "UFCS",
  pe1: "PE 1.0",
  pe2: "PE 2.0",
  pd5v: "PD 5V",
  pdhv: "PD HV",
  pd_spr_avs: "PD SPR AVS",
  pps: "PD PPS",
  epr: "PD EPR",
  pd_avs: "PD AVS",
  usb: "USB 5V",
  not_charging: "Not charging",
};

let lang = "zh";

export function setLang(next) {
  lang = next === "en" ? "en" : "zh";
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  return lang;
}

export function getLang() {
  return lang;
}

export function t(key, vars) {
  const table = DICT[lang] || DICT.zh;
  let value = table[key];
  if (value === undefined) value = DICT.zh[key];
  if (value === undefined) return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

function readVars(el) {
  const raw = el.getAttribute("data-i18n-vars");
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"), readVars(el));
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.title = t("appTitle");
}

/** Localized protocol label; prefers the data layer's Chinese label in zh mode. */
export function protocolLabel(port) {
  if (!port) return "—";
  if (lang === "zh" && port.protocolLabel) return port.protocolLabel;
  if (PROTOCOL_EN[port.protocol]) return PROTOCOL_EN[port.protocol];
  if (Number.isFinite(port.protocolCode)) return t("unknownProtocol", { code: port.protocolCode });
  return "—";
}

/** Localized firmware state string (falls back to the raw firmware value). */
export function firmwareStateLabel(port) {
  if (!port) return "—";
  const raw = String(port.state || "").toUpperCase();
  const map = {
    ACTIVE: "stateIdle",
    ATTACHED: "stateCharging",
    INACTIVE: "stateInactive",
    BOOTING: "stateBooting",
    DETACHING: "stateDetaching",
    OPENING: "stateOpening",
    CLOSING: "stateClosing",
    OVER_TEMP_WARNING: "stateOverTempWarn",
    OVER_TEMP_ALERT: "stateOverTempAlert",
    COOLING: "stateCooling",
    CHECKING: "stateChecking",
    RECOVERING: "stateRecovering",
    DEAD: "stateDead",
    LIMITED_POWER: "stateLimitedPower",
  };
  if (map[raw]) return t(map[raw]);
  return raw || "—";
}
