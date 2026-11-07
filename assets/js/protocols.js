/**
 * 小电拼 CP-02 · 协议/端口常量（浏览器端共享）
 * 与固件 FastChargingProtocol 枚举保持一致：
 * components/chip_data_types/include/data_types.h
 */

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

export function portType(id) {
  return Number(id) === 0 ? "A" : "C";
}

/** App 自由流配色：A 蓝 / C1-C4 橙红渐变（仅作图形编码，数字用正文色） */
export const PORT_COLORS = ["#2C89FB", "#FFC444", "#FFA51E", "#FF921E", "#FF7315"];

export function portColor(id) {
  return PORT_COLORS[Number(id)] || "#94a3b8";
}
