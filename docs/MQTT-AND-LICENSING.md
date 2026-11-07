# MQTT Broker、MCP 与 Pro/Ultra 授权说明

> 实测设备：CANDYSIGN CP-02 系列，`device_model=pro`，固件 `2.2.0`（2026-11-07）。
> 本文所有示例都用占位符（`cp02-<PSN>.local`、`192.168.1.100`），不包含真实 PSN / MAC / token。
> 结论按当时的固件与设备授权记录；换固件、换机器或升级 license 后需要重新验证。

---

## 1. 结论摘要

1. **局域网 `/metrics.json` / `/metrics` 没有温度、PD 详情、电池、线材字段**。
   - `/metrics.json` 的 `pd_status` 在 Pro 2.2.0 上恒为 `null`。
   - `/metrics` 只有电压/电流/协议/系统指标，没有温度。
2. **MCP 可以拿到这些数据**，但 MCP 地址带 token，需要从微信小程序复制。
   - 官方对比表里 **Pro 和 Ultra 都支持「龙虾服务」/ MCP**，不是 Ultra 独占。
3. **自定义 MQTT broker 是另一个能力，由 license feature bit 控制**。
   - 本机 `POST /setbrokerz` 返回 `403 Feature is disabled`；**没有发生写入**。
   - 从固件枚举看，对应 `MQTT_BROKER_CONFIG` feature bit；`pd_status` 为 null 很可能对应
     `METRICS_JSON_PD_STATUS` feature bit。
   - 这类能力更像 **Ultra / 糖码 license** 解锁项；Pro 可以通过糖码升级，不需要换硬件。
4. **不要在 Pro 上强行改 NVS / 绕 feature bit**。既没有安全的还原路径，也不属于正常授权范围。
5. 看板已经按 `device_model` 自动显示 **Pro** 或 **Ultra**，并支持 Pro/Ultra 混合多台监看。

---

## 2. Pro 与 Ultra 的差异

官方对比表（[CANDYSIGN 微博](https://weibo.com/2/detail/5346721887423088)）的要点：

| 项目 | Pro | Ultra |
| --- | --- | --- |
| 硬件 | 160W、4C1A、C 口 140W、A 口 60W、ESP32 + FPGA + SW3566 | 相同 |
| 状态屏颜色 | 金珀色 | 琥珀色 |
| AI 充电系统 | FluxAI 自由流 2.0 | FluxAI 自由流 2.0 + **Premium Kit** |
| 龙虾服务 / MCP | ✅ 全面支持 | ✅ 全面支持 |
| 价格 / SKU | 较低 | 较高 |
| 升级 | 可通过 **糖码 license** 升级为 Ultra | — |

因此：

- **MCP 不是 Ultra 专属**。把 MCP 锁成 Ultra 专属会与官方表冲突。
- Ultra 主要是 **Premium Kit / 状态屏颜色 / SKU 权益**，以及 license 控制的 feature bit。
- 判断能力时应优先看 **license/feature bit**，不能只看 `device_model`；Pro 升级糖码后型号也可能变化。

---

## 3. MCP：怎么拿、能拿什么

### 3.1 获取步骤

1. 微信小程序搜索 **「制糖工厂 CANDYSIGN」**。
2. 进入这台小电拼的设备页。
3. 点底部 **「设置」**。
4. 找到 **「核心功能」**。
5. 打开 **「龙虾服务」**（标注“AI 自主控制”）。
6. 点 **复制**。

复制出来的是一整段给 AI 的安装提示，里面包含：

```text
https://mcp.thecandysign.com/<PSN>/<TOKEN>/sse
```

或：

```text
https://mcp.thecandysign.com/<PSN>/<TOKEN>/mcp
```

- 页面显示的地址打码，只有复制出来才完整。
- 每台设备地址不同。
- 点「重置 MCP 密钥」后旧地址立即失效。
- **token 等于设备控制权**，不要提交到仓库、Pages、截图、日志或公开聊天。
- 如果点「龙虾服务」跳到订阅页，说明当前设备/账号的这项服务未开通；分享/体验用户看不到地址。

来源参考：[CoCanBar 首次配置](https://github.com/yangyihang96/CoCanBar)、
[官方 AI 接入说明](https://thecandysign.com/cocan/zh/ai-integration/)。

### 3.2 MCP 能读到的数据

| 数据 | MCP 工具/字段 |
| --- | --- |
| 端口实时电压、电流、功率、协议 | `get_port_details` |
| 温度档位（凉爽 / 温和 / 偏热，**不是精确 °C**） | `get_port_details.die_temperature` |
| 品牌 / 型号（云端按 VID/PID 识别） | `get_port_pd_status` 的 `device_brand_*` / `device_name_*` |
| 电池设计容量 / 满充容量 / 当前容量 / 状态 | `battery_design_capacity`、`battery_last_full_charge_capacity`、`battery_present_capacity` |
| 电量 % / 健康度 % | 前端计算：`present/full`、`full/design` |
| C4 线材 VID/PID、USB 速率、最大电压/电流、E-Marker | `cable_vid`、`cable_pid`、`cable_usb_highest_speed`、`cable_max_vbus_*`、`has_emarker` |
| PD 版本、协商电压/电流、PPS/EPR | `pd_revision`、`operating_voltage/current`、`pps_charging_supported` |
| 充电策略、温控、屏幕亮度、端口开关等控制 | MCP 写工具（本项目不使用） |

> 温度只有档位；固件 BLE 的 `GET_PORT_PD_STATUS` 里有数值 `die_temperature`，但设备连上
> Wi-Fi/MQTT 后会停 BLE 广播，不适合做稳定的看板数据源。

---

## 4. 自定义 MQTT broker

### 4.1 官方/网络资料的调用方式

网络资料给出的调用方式（**在 feature 开启的设备上**）：

```bash
# 1. 设置自定义 broker
curl -X POST 192.168.1.100/setbrokerz -d mqtt://172.16.3.38:1883

# 2. 重启 MQTT client，或者断电重启
curl 192.168.1.100/destroymqtt
curl 192.168.1.100/startmqtt

# 3. 查看当前 broker（注意：本机固件没有这个接口）
curl 192.168.1.100/getbrokerz

# 4. 还原默认 broker
curl -X POST 192.168.1.100/setbrokerz
```

注意：一旦自定义 broker 生效，**官方小程序/云端会不可用**，直到还原默认 broker。

### 4.2 本机 2.2.0 实测

设备 `__ENDPOINTS` 实际暴露的是：

```text
/metrics
/metrics.json
/porthistoryz
/filez
/heapz
/pingz
/logz
/destroymqttz
/startmqttz
/setbrokerz
/subscribez
```

实测结果：

| 请求 | 结果 |
| --- | --- |
| `GET /getbrokerz` | `404`（该接口不存在） |
| `GET /setbrokerz` | `405`（只接受 POST） |
| `GET /destroymqtt`、`GET /startmqtt` | `404`（无 z 的旧路径不存在） |
| `POST /setbrokerz`（空 body） | **`403 Forbidden` + `Error: Feature is disabled.`** |

空 POST 前后：

```text
__CONFIG 前: {"broker":"mqtts://iot-broker.ifanrusercontent.com:8883"}
__CONFIG 后: {"broker":"mqtts://iot-broker.ifanrusercontent.com:8883"}
ionbridge_mqtt_connected 1
ionbridge_mqtt_connection_total 1
```

说明：

- **没有写入 broker**，所以不需要还原；官方云连接未受影响。
- 403 是 feature 开关在写 NVS 之前拦截；不是 URL 写错。
- 当前 broker 的“读接口”是设备首页里的 `window.__CONFIG`，不是 `/getbrokerz`。
- 带 z 的 `/destroymqttz`、`/startmqttz` 存在，但本机没有执行；按同一 feature gate 推断大概率也不可用。

### 4.3 固件里的 feature bit

官方开源固件 `components/license/include/feature_bits.h`：

```cpp
enum Feature : uint8_t {
  MQTT_BROKER_CONFIG = 0,
  METRICS_JSON_PD_STATUS = 1,
};
```

| feature bit | 作用 | 本机 Pro |
| --- | --- | --- |
| `MQTT_BROKER_CONFIG` | 允许配置自定义 MQTT broker | 关闭（403） |
| `METRICS_JSON_PD_STATUS` | 允许 `/metrics.json` 输出 PD 状态详情 | 关闭（`pd_status=null`） |

这是**基于固件枚举和 403 文案的合理推断**：公开 firmware clone 的 web server 不包含这些
2.2.0 端点实现，无法从源码逐行确认。不要把推断写成“已证实”。

### 4.4 如果将来 feature 开启，安全验证流程

**前提：设备已通过 Ultra/糖码授权，feature bit 已开启；本机有可被设备访问的 MQTT broker。**

1. 读取并记录当前状态：
   ```bash
   curl -s http://cp02-<PSN>.local/ | grep __CONFIG
   curl -s http://cp02-<PSN>.local/metrics | grep mqtt
   ```
2. 只做一次 set，且先确认能访问 broker：
   ```bash
   curl -sS -X POST http://cp02-<PSN>.local/setbrokerz -d mqtt://192.168.1.20:1883
   ```
3. 读 `__CONFIG` 确认 broker 变化；观察 broker 是否收到 CONNECT/telemetry。
4. 立刻还原：
   ```bash
   curl -sS -X POST --data '' http://cp02-<PSN>.local/setbrokerz
   ```
5. 再读 `__CONFIG`，确认回到 `mqtts://iot-broker.ifanrusercontent.com:8883`；
   读 `/metrics` 确认 `ionbridge_mqtt_connected 1`。
6. 如果还原后没有重新连接，按资料尝试 `/startmqttz`，最后手段是断电重启。
7. **每一步都记录前后值**；不要在未验证还原的设备上批量操作。

> 本机 Pro 在第一步 `POST` 就被 403 拦截，没有进入 set 流程，因此当前不存在“需要还原”的状态。

### 4.5 开启后能多控制什么

自定义 broker 使用官方 MQTT v5 + Protobuf（topic/命令表见
[官方 MQTT 文档](https://thecandysign.com/cocan/zh/mqtt/) 与固件
`docs/MQTT Communication Protocol.md`）。能力面比只读 LAN 大得多：

| 类别 | 能力 |
| --- | --- |
| 端口 | 开/关、端口优先级、端口类型、兼容性开关、自定义 PDO、电缆补偿、PD 状态 |
| 功率 | 充电策略、温度模式、临时功率分配 |
| 显示 | 亮度、模式、旋转/翻转、CP02S 的屏显/待机/整点报时 |
| 系统 | 重启/重置、Wi-Fi 扫描/配置、版本、license、诊断、文件/NVS、OTA |
| 遥测 | 端口状态、设备状态、PD 状态流、历史功率、功率分配、配置报告、任务结果 |

这些**不是**本项目当前已实现的写控制；本项目仍保持只读，不自动调用任何控制命令。

---

## 5. 数据来源对照

| 数据 | 局域网 `/metrics.json` | Prometheus `/metrics` | MCP | 自定义 MQTT |
| --- | --- | --- | --- | --- |
| 电压 / 电流 / 功率 / 协议 | ✅ | ✅ | ✅ | ✅ |
| 温度档位 | ❌ | ❌ | ✅ | ✅（telemetry） |
| 精确温度 °C | ❌ | ❌ | ⚠️ 只给档位 | ✅（`die_temperature`） |
| PD 版本 / 协商档位 | ❌（Pro `pd_status=null`） | ❌ | ✅ | ✅ |
| 品牌 / 型号 | ❌ | ❌ | ✅（云端识别） | ✅（VID/PID，品牌需本地映射） |
| 电池容量 / 电量 / 健康 | ❌ | ❌ | ✅ | ✅ |
| 线材 VID / 速率 / 功率 | ❌ | ❌ | ✅ | ✅ |
| 端口开关 / 策略 / 温控 | ❌ 只读 | ❌ | ✅（写） | ✅（写） |
| 需要 token | 否 | 否 | 是 | 否（但需 feature） |
| 需要 Ultra/糖码 feature | 否 | 否 | 否（按账号授权） | 是 |

---

## 6. 看板当前的模型与混用行为

- 设备型号从快照 `device.model` 读取：
  - `pro` → **AI 小电拼 Pro**
  - `ultra` → **AI 小电拼 Ultra**
- 已保存设备会在每次成功轮询后同步 `name / psn / model / modelLabel / lastSeen`，
  不再长期显示旧的 “Pro / Ultra”。
- 设备弹窗显示 Pro/Ultra 徽标；多台模式可以混用 Pro 与 Ultra。
- 官方表里 MCP 两者都支持，因此看板**没有**把 MCP 数据按型号锁成 Ultra 专属。
- 如果后续要做 Ultra/糖码专属功能，建议按 **license/feature bit** 判断，而不是仅按 `device_model`；
  `MQTT_BROKER_CONFIG` / `METRICS_JSON_PD_STATUS` 就是两个现成的 feature 例子。

---

## 7. 来源

| 来源 | 用途 |
| --- | --- |
| 本机实测（2026-11-07） | `/metrics.json` 无温度、`pd_status=null`、`setbrokerz` 403、`__CONFIG` 前后不变 |
| [官方 MQTT 页面](https://thecandysign.com/cocan/zh/mqtt/) | 本地 Prometheus/JSON、云端 MCP、MQTT topic/能力面 |
| [官方 AI 接入](https://thecandysign.com/cocan/zh/ai-integration/) | MCP 工具范围、URL 形状、本地指标 |
| [官方个性化](https://thecandysign.com/cocan/zh/customization/) | Pro / Ultra、糖码/高级能力 |
| [CANDYSIGN 官方对比表](https://weibo.com/2/detail/5346721887423088) | Pro/Ultra 硬件、MCP、Premium Kit、糖码 |
| [CoCanBar 首次配置](https://github.com/yangyihang96/CoCanBar) | 小程序「龙虾服务」复制 MCP 的具体路径 |
| [ifanrx/IonBridge](https://github.com/ifanrx/IonBridge) | `feature_bits.h`、`data_types.proto`、MQTT/Telemetry 字段 |
| [docs/APP-PARITY.md](APP-PARITY.md) | 设备协议、App 对齐、数据语义 |
| [docs/DATA-CONTRACT.md](DATA-CONTRACT.md) | 看板数据契约 |

---

## 8. 安全边界

- 不在 Pro 上尝试绕过 feature bit、改 NVS 或伪造 license。
- 不把 MCP token、broker 地址、设备密码写进仓库、Pages、截图或日志。
- 自定义 broker 会让官方小程序/云端失效；除非明确需要本地控制，否则保持默认。
- 任何 `setbrokerz` 实验必须在**已验证还原路径**、**可访问本地 broker**、**能物理断电重启**的前提下进行。
- 本项目当前只读；不会自动调用控制类 MCP/MQTT 命令。
