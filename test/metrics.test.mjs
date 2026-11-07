import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeProtocol,
  normalizeJson,
  normalizePrometheus,
  normalizeHistory,
  parseInfoHtml,
  parsePrometheusText,
  sessionWhFromRaw,
} from "../lib/metrics.mjs";

const INFO = {
  psn: "TEST0001",
  device_name: "CP02-TEST",
  device_model: "pro",
  product_family: "CP02",
  product_color: "white",
  hw_rev: "MP0",
  esp32_version: "2.2.0",
  mcu_version: "0.3.36",
  fpga_version: "0.2.9",
  zrlib_version: "1.8.1",
  country_code: "US",
  mdns_hostname: "cp02-test",
};

function sampleJson() {
  return {
    ports: [
      { id: 0, active: true, state: "ACTIVE", port_type: "A", attached: false, charging_duration_seconds: 0, fc_protocol: 255, current: 0, voltage: 0, vin_value: 29760, session_id: 0, session_charge: 0, power_budget: 0, pd_status: null },
      { id: 1, active: true, state: "ATTACHED", port_type: "C", attached: true, charging_duration_seconds: 233, fc_protocol: 16, current: 2358, voltage: 9136, vin_value: 29760, session_id: 6, session_charge: 203601539, power_budget: 140, pd_status: null },
      { id: 2, active: true, state: "ATTACHED", port_type: "C", attached: true, charging_duration_seconds: 217, fc_protocol: 16, current: 0, voltage: 19888, vin_value: 29820, session_id: 6, session_charge: 444993, power_budget: 140, pd_status: null },
      { id: 3, active: true, state: "ATTACHED", port_type: "C", attached: true, charging_duration_seconds: 234, fc_protocol: 15, current: 90, voltage: 5200, vin_value: 29970, session_id: 6, session_charge: 145942139, power_budget: 140, pd_status: null },
      { id: 4, active: true, state: "ACTIVE", port_type: "C", attached: false, charging_duration_seconds: 0, fc_protocol: 255, current: 0, voltage: 0, vin_value: 30040, session_id: 0, session_charge: 0, power_budget: 0, pd_status: null },
    ],
    system: { chip: "esp32c3", cores: 1, cpu_freq_mhz: 160, idf_version: "v5.5.3", app_version: "2.2.0", boot_time_seconds: 4164, reset_reason: 3, free_heap: 41432 },
    wifi: { ssid: "TEST-2.4G", bssid: "02:00:00:00:00:03", channel: 6, rssi: -44 },
  };
}

test("protocol enum decodes firmware values", () => {
  assert.equal(decodeProtocol(0).label, "USB 普通");
  assert.equal(decodeProtocol(15).label, "PD 5V");
  assert.equal(decodeProtocol(16).label, "PD 高压");
  assert.equal(decodeProtocol(18).family, "pps");
  assert.equal(decodeProtocol(255).key, "not_charging");
  assert.equal(decodeProtocol(99).key, "unknown");
  assert.match(decodeProtocol(99).label, /99/);
});

test("session charge uses SW3566 24.552 µWs raw unit", () => {
  assert.equal(sessionWhFromRaw(203601539), 1.3886);
  assert.equal(sessionWhFromRaw(0), 0);
  assert.equal(sessionWhFromRaw(null), null);
});

test("normalizeJson produces stable snapshot", () => {
  const now = 1762483200000;
  const snap = normalizeJson(sampleJson(), { info: INFO, host: "192.168.1.20", now });

  assert.equal(snap.ok, true);
  assert.equal(snap.source, "metrics.json");
  assert.equal(snap.ports.length, 5);
  assert.equal(snap.ports[0].name, "A");
  assert.equal(snap.ports[1].name, "C1");
  assert.equal(snap.ports[1].protocolLabel, "PD 高压");
  assert.equal(snap.ports[1].stateLabel, "充电中");
  assert.equal(snap.ports[0].stateLabel, "空闲");
  assert.equal(snap.ports[1].powerW, 21.543);
  assert.equal(snap.ports[1].sessionWh, 1.3886);
  assert.equal(snap.device.modelLabel, "AI 小电拼 Pro / Ultra（CP-02）");
  assert.equal(snap.device.maxPowerW, 160);
  assert.equal(snap.totals.powerW, 22.01);
  assert.equal(snap.totals.attachedCount, 3);
  assert.equal(snap.totals.chargingCount, 2);
  assert.equal(snap.totals.inputVoltageV, 29.87);
  assert.equal(snap.capabilities.energy, true);
  assert.equal(snap.capabilities.prometheus, false);
});

test("parseInfoHtml extracts IonBridge identity", () => {
  const html = `<!DOCTYPE html><html><head></head><body>
<script>window.__ENDPOINTS=["/","/metrics","/metrics.json"];</script>
<script>window.__INFOZ={"psn":"TEST0001","ble_mac":"02:00:00:00:00:01","wifi_mac":"02:00:00:00:00:02","hw_rev":"MP0","device_model":"pro","device_name":"CP02-TEST","product_family":"CP02","product_color":"white","esp32_version":"2.2.0","mcu_version":"0.3.36","fpga_version":"0.2.9","zrlib_version":"1.8.1","country_code":"US","mdns_hostname":"cp02-test"};</script>
<script>window.__CONFIG={"broker":"mqtts://example.invalid:8883"};</script>
</body></html>`;
  const parsed = parseInfoHtml(html);
  assert.equal(parsed.info.psn, "TEST0001");
  assert.equal(parsed.info.product_family, "CP02");
  assert.deepEqual(parsed.endpoints, ["/", "/metrics", "/metrics.json"]);
  assert.equal(parsed.config.broker, "mqtts://example.invalid:8883");
  assert.equal(parseInfoHtml("<html>nope</html>").info, null);
});

test("parsePrometheusText handles labels and comments", () => {
  const text = `# TYPE ionbridge_port_voltage gauge
ionbridge_port_voltage{id="1"} 9136
# TYPE ionbridge_wifi_signal gauge
ionbridge_wifi_signal{ssid="TEST-2.4G",bssid="02:00:00:00:00:03",channel="6"} -44
`;
  const samples = parsePrometheusText(text);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].labels.id, "1");
  assert.equal(samples[1].value, -44);
  assert.equal(samples[1].labels.ssid, "TEST-2.4G");
});

test("normalizePrometheus maps ports and marks capabilities", () => {
  const now = 1762483200000;
  const text = `
ionbridge_port_state{id="0"} 1
ionbridge_port_fc_protocol{id="0"} 255
ionbridge_port_voltage{id="0"} 0
ionbridge_port_current{id="0"} 0
ionbridge_port_state{id="1"} 1
ionbridge_port_fc_protocol{id="1"} 16
ionbridge_port_voltage{id="1"} 9136
ionbridge_port_current{id="1"} 2352
ionbridge_port_state{id="2"} 1
ionbridge_port_fc_protocol{id="2"} 16
ionbridge_port_voltage{id="2"} 19888
ionbridge_port_current{id="2"} 0
ionbridge_port_state{id="3"} 1
ionbridge_port_fc_protocol{id="3"} 15
ionbridge_port_voltage{id="3"} 5200
ionbridge_port_current{id="3"} 90
ionbridge_port_state{id="4"} 1
ionbridge_port_fc_protocol{id="4"} 255
ionbridge_port_voltage{id="4"} 0
ionbridge_port_current{id="4"} 0
ionbridge_boot_time_seconds{reset_reason="3"} 4104
ionbridge_uptime_seconds 4104
ionbridge_free_heap 42740
ionbridge_wifi_signal{ssid="TEST-2.4G",bssid="02:00:00:00:00:03",channel="6"} -45
`;
  const snap = normalizePrometheus(text, { info: INFO, host: "192.168.1.20", now });
  assert.equal(snap.source, "prometheus");
  assert.equal(snap.capabilities.prometheus, true);
  assert.equal(snap.capabilities.energy, false);
  assert.equal(snap.ports[1].attached, true);
  assert.equal(snap.ports[0].attached, false);
  assert.equal(snap.ports[2].attached, true);
  assert.equal(snap.ports[1].sessionWh, null);
  assert.equal(snap.ports[1].chargingSeconds, null);
  assert.equal(snap.system.freeHeap, 42740);
  assert.equal(snap.system.resetReason, 3);
  assert.equal(snap.wifi.ssid, "TEST-2.4G");
  assert.ok(snap.warnings.some((w) => w.includes("Prometheus")));
});

test("normalizeHistory maps equal spacing and power", () => {
  const now = 1762483200000;
  const payload = {
    sample_period_ms: 10000,
    ports: [
      { port: 1, samples: [{ voltage: 9000, current: 2000 }, { voltage: 9000, current: 2100 }] },
    ],
  };
  const hist = normalizeHistory(payload, { now, host: "192.168.1.20" });
  assert.equal(hist.samplePeriodMs, 10000);
  assert.equal(hist.ports[0].name, "C1");
  assert.equal(hist.ports[0].samples.length, 2);
  assert.equal(hist.ports[0].samples[0].t, now - 10000);
  assert.equal(hist.ports[0].samples[1].t, now);
  assert.equal(hist.ports[0].samples[1].powerW, 18.9);
});
