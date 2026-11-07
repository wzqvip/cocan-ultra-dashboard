# 数据契约 · Dashboard Snapshot v1

本文件是前端与数据层之间唯一的接口约定。前端只消费下面两种 JSON，不需要知道设备
HTTP 端点的细节；数据层负责把设备的 `/metrics.json`、Prometheus `/metrics` 和演示数据
归一化成同一种形状。

设备（CANDYSIGN CP-02 / AI 小电拼 Ultra）的 HTTP 服务**不发送 CORS 头**，所以浏览器
不能直接 `fetch` 设备。运行 `node server.mjs` 后，代理接口与静态页面同源，页面请求
`/api/*` 即可。

---

## 1. Snapshot

`GET /api/snapshot?host=<host>&mode=auto|json|prometheus`

```jsonc
{
  "ok": true,
  "source": "metrics.json",          // "metrics.json" | "prometheus" | "demo"
  "host": "192.168.1.20",
  "fetchedAt": 1762483200000,        // ms epoch
  "latencyMs": 18,
  "mode": "auto",
  "warnings": [],                    // 人话警告，可直接显示
  "device": {
    "psn": "<PSN>",
    "name": "CP02-EXAMPLE",
    "model": "pro",
    "family": "CP02",
    "modelLabel": "AI 小电拼 Pro（CP-02）",
    "color": "white",
    "hwRev": "MP0",
    "esp32Version": "2.2.0",
    "mcuVersion": "0.3.36",
    "fpgaVersion": "0.2.9",
    "zrlibVersion": "1.8.1",
    "country": "US",
    "mdnsHostname": "cp02-<PSN>",
    "bleMac": "02:00:00:00:00:02",
    "wifiMac": "02:00:00:00:00:01",
    "maxPowerW": 160,                // 整机标称预算
    "portMaxW": [60, 140, 140, 140, 140] // 标称单口上限，仅展示用
  },
  "system": {
    "chip": "esp32c3",
    "cores": 1,
    "cpuFreqMhz": 160,
    "idfVersion": "v5.5.3",
    "appVersion": "2.2.0",
    "uptimeSeconds": 4164,
    "resetReason": 3,
    "freeHeap": 41432
  },
  "wifi": { "ssid": "Example-2.4G", "bssid": "02:00:00:00:00:03", "channel": 6, "rssi": -44 },
  "ports": [
    {
      "id": 0,
      "name": "A",                    // A, C1..C4（与 App / 机身一致）
      "type": "A",                    // "A" | "C"
      "active": true,                 // 端口功能开启
      "attached": false,              // 是否插入设备
      "state": "ACTIVE",              // 固件状态字符串
      "stateLabel": "空闲",
      "voltageMv": 0,
      "currentMa": 0,
      "powerW": 0,
      "protocolCode": 255,
      "protocol": "none",             // 机器键，见协议表
      "protocolLabel": "未充电",
      "protocolFamily": "idle",       // idle | pd | pps | pdo_compat | vendor | unknown
      "chargingSeconds": 0,
      "sessionId": 0,
      "sessionChargeRaw": 0,
      "sessionWh": 0,                 // 由 raw × 24.552 µWs 换算
      "vinMv": 29760,
      "powerBudgetW": 0,
      "pdStatus": null
    }
  ],
  "totals": {
    "powerW": 72.4,
    "attachedCount": 3,
    "chargingCount": 3,
    "sessionWh": 12.345,
    "budgetW": 160,
    "utilization": 45.3,             // powerW / budgetW * 100
    "inputVoltageV": 29.76
  },
  "capabilities": {
    "energy": true,                  // 是否提供 sessionWh / chargingSeconds
    "deviceInfo": true,
    "pd": false,
    "temperature": false,
    "prometheus": false              // 本次是否来自 Prometheus 文本端点
  }
}
```

### 字段规则

- 所有电压统一 **mV**，电流统一 **mA**，功率统一 **W**，能量统一 **Wh**。
- `powerW = voltageMv × currentMa / 1e6`（保留 3 位小数）。
- `sessionWh = sessionChargeRaw × 24.552 / 3.6e9`（保留 4 位小数）。`24.552` 是
  SW3566 原始计数到 µWs 的转换系数（`sw3566_data_types.h`），已实测校验。
- Prometheus 模式没有累计电量/充电时长/PD 详情，对应字段为 `null`，
  `capabilities.energy=false`，前端应显示「该数据源不提供」而不是 0。
- 端口顺序固定 `[0,1,2,3,4]`，名称固定 `A, C1, C2, C3, C4`；不要按功率重排。
- `state` 原样保留固件值：`ACTIVE`（端口开启、未插设备）、`ATTACHED`（已插入）、
  `INACTIVE`、`BOOTING`、`DETACHING`、`OPENING`、`CLOSING`、`OVER_TEMP_WARNING`、
  `OVER_TEMP_ALERT`、`COOLING`、`CHECKING`、`RECOVERING`、`DEAD`、`LIMITED_POWER`。
- 未知值不要猜测：保留原值，`protocolLabel` 用 `未知 (n)`。

### 状态展示建议

| 条件 | 展示 |
| --- | --- |
| `attached && powerW >= 0.1` | 充电中 |
| `attached && powerW < 0.1 && voltageMv > 1000` | 已连接 · 未取电 |
| `!attached && active` | 空闲 |
| `!active` | 已关闭 |
| `state` 为过温/限功率等 | 以固件状态优先提示 |

---

## 2. 历史

`GET /api/history?host=<host>&limit=180`

```jsonc
{
  "ok": true,
  "source": "metrics.json",
  "host": "192.168.1.20",
  "fetchedAt": 1762483200000,
  "samplePeriodMs": 10000,
  "endTs": 1762483200000,
  "ports": [
    {
      "id": 1,
      "name": "C1",
      "type": "C",
      "samples": [
        { "t": 1762481400000, "voltageMv": 9128, "currentMa": 2254, "powerW": 20.577 }
      ]
    }
  ]
}
```

- 设备 `/porthistoryz?limit=N` 默认每 10 s 一个点，最多约 180 个点（30 分钟）。
- 前端可继续在 `localStorage` 里累积更长的曲线（建议 2 小时，10 s 一点）。
- 历史里没有协议/温度字段，只画功率曲线；当前值始终以 snapshot 为准。

---

## 3. 多台聚合

`GET /api/multi?hosts=<host1>,<host2>&mode=auto|json|prometheus`

最多 8 台；设备并行读取（并发 3）。单台失败不会拖垮整页，会出现在 `errors` 里。

```jsonc
{
  "ok": true,
  "source": "metrics.json",
  "fetchedAt": 1762483200000,
  "count": 2,
  "devices": [
    {
      "index": 0,                 // 请求里的槽位，0-based；不做数组压缩
      "label": "机 1",
      "host": "192.168.1.20",
      "device": { "slot": 1, "name": "CP02-A" },
      "ports": [
        {
          "id": 0,
          "globalId": 0,          // index × 5 + id：机1 = 0–4，机2 = 5–9
          "deviceIndex": 0,
          "name": "A",
          "powerW": 0
        }
      ],
      "totals": { "powerW": 37.4, "budgetW": 160 }
    }
  ],
  "totals": {
    "powerW": 72.4,               // 所有在线设备之和
    "budgetW": 320,               // 160 × N（标称）
    "utilization": 22.6,
    "attachedCount": 7,
    "chargingCount": 6,
    "sessionWh": 12.345,
    "deviceCount": 2,
    "portCount": 10,
    "onlineCount": 2
  },
  "errors": [
    { "host": "192.168.1.99", "error": "DEVICE_UNREACHABLE", "message": "无法连接设备" }
  ]
}
```

- `devices[].index` 保持请求槽位：即使机 1 离线，机 2 仍然是 `index=1`、端口 `5–9`。
- `globalId` 只用于展示/选择，不改变设备本地的 `id`（0–4）。
- 前端多台模式必须用 `device.index` / `port.globalId` 编号，不要用数组下标重新编号。

### 多台历史

`GET /api/multi-history?hosts=<host1>,<host2>&limit=180`

```jsonc
{
  "ok": true,
  "fetchedAt": 1762483200000,
  "devices": [
    { "host": "192.168.1.20", "index": 0, "history": { /* 与 /api/history 相同 */ } }
  ],
  "errors": []
}
```

---

## 4. 其他代理接口

| 接口 | 返回 |
| --- | --- |
| `GET /api/health` | `{ ok, name, version, uptimeSeconds, defaultHost }` |
| `GET /api/info?host=` | `{ ok, host, device, endpoints, latencyMs }` |
| `GET /api/scan` | `{ ok, subnets:[...], devices:[{ host, ip, name, psn, modelLabel, ports }] }` |
| `GET /api/history?host=&limit=` | 见上 |
| `GET /api/multi?hosts=&mode=` | 见「多台聚合」 |
| `GET /api/multi-history?hosts=&limit=` | 见「多台历史」 |

`host` 省略时使用启动参数 `--host` / 环境变量 `DEVICE_HOST`；都没有时返回
`400 { error: "NO_DEVICE" }`，前端应引导用户输入地址或扫描局域网。

`host` 只接受内网/`.local` 目标（10/8、172.16/12、192.168/16、169.254/16、
localhost、`*.local`、`*.lan`），拒绝公网地址，避免代理被当成 SSRF 跳板。

---

## 5. 协议表（固件 `FastChargingProtocol`）

| code | key | 显示 | 说明 |
| --- | --- | --- | --- |
| 0 | usb | USB 普通 | 无快充协议；有电压时即 USB Legacy 5V |
| 1 | QC2 | QC2.0 | |
| 2 | QC3 | QC3.0 | |
| 3 | QC3P | QC3+ | |
| 4 | SFCP | SFCP | |
| 5 | AFC | AFC | 三星 |
| 6 | FCP | FCP | 华为 |
| 7 | SCP | SCP | 华为 |
| 8 | VOOC1 | VOOC 1.0 | |
| 9 | VOOC4 | VOOC 4.0 | |
| 10 | SVOOC2 | SuperVOOC 2.0 | |
| 11 | TFCP | TFCP | |
| 12 | UFCS | UFCS | 融合快充 |
| 13 | PE1 | PE 1.0 | |
| 14 | PE2 | PE 2.0 | |
| 15 | PD5V | PD 5V | 固定 5V |
| 16 | PDHV | PD 高压 | 固定高压（9/12/15/20V） |
| 17 | PD_SPR_AVS | PD SPR AVS | |
| 18 | PPS | PD PPS | |
| 19 | EPR | PD EPR | |
| 20 | PD_AVS | PD AVS | |
| 255 | not_charging | 未充电 | 固件 `FC_NOT_CHARGING` |

> `fc_protocol = 0` 表示「无快充协议」，可能仍在 5V 普通充电；只有 `255` 才是未充电。

---

## 6. 演示模式

- `?demo=1` 强制演示；GitHub Pages（`*.github.io`）自动进入演示。
- `?demo=2`（或 `?demoDevices=2`）演示两台设备；`?demo=1..6` 可演示 1–6 台，端口编号 P0–P(5N-1)，用于验证多台 UI。
- 演示数据由 `assets/js/demo.js` 生成，形状与上面的 snapshot/history 完全一致，
  包含 5 个端口、协议切换、功率波动和历史曲线，**不含任何真实 PSN / MAC / SSID / IP**。
- 多台演示由 `demoMulti(count)` / `demoMultiHistoryFor(count)` 聚合，`device.index` 为 0、1，
  `ports[].globalId` 为 0–9。
- 演示模式下页面应显示「演示数据」徽标，避免误认为真实设备。

---

## 7. 数据来源与能力差异

| 能力 | `/metrics.json` | Prometheus `/metrics` |
| --- | --- | --- |
| 五路电压/电流/功率 | ✅ | ✅ |
| 协议 | ✅ | ✅ |
| 充电时长 / 累计电量 | ✅ | ❌ |
| 端口连接状态 / 端口类型 | ✅ | ❌（按电压推断） |
| PD 详情 | 固件通常为 null | ❌ |
| 系统 / Wi-Fi | ✅ | ✅ |
| 设备身份（PSN/固件） | 从 `/` 解析 | 从 `/` 解析 |
| 历史 `/porthistoryz` | ✅ | ✅（同一端点） |

因此 `mode=auto` 优先用 `/metrics.json`；Prometheus 模式保留给「只有 Prometheus
采集/被防火墙限制」或「想验证 Prometheus 输出」的场景。
