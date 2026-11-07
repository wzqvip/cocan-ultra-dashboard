# Pro / Ultra 适配说明

> 实测设备：**CANDYSIGN CP-02 Pro**，固件 `2.2.0`，`device_model=pro`，`product_family=CP02`。
> 本文说明看板如何识别 Pro/Ultra、混用多台、以及哪些能力应按 Ultra/license 区分。
> 示例不包含真实 PSN、MAC、token 或设备 IP。

---

## 1. 型号从哪来

设备首页的 `window.__INFOZ` 提供：

```json
{
  "device_model": "pro",
  "product_family": "CP02",
  "device_name": "CP02-<PSN>",
  "hw_rev": "MP0",
  "esp32_version": "2.2.0",
  "mcu_version": "0.3.36",
  "fpga_version": "0.2.9"
}
```

看板读取 `device_model`，生成显示名：

| `device_model` | 显示 |
| --- | --- |
| `pro` | AI 小电拼 Pro（CP-02） |
| `ultra` | AI 小电拼 Ultra（CP-02） |
| 其他/缺失 | AI 小电拼 CP-02 |

不会再把本机固定写成 “Pro / Ultra”；设备列表、标题、系统信息都跟随实时快照。

---

## 2. 看板为 Pro/Ultra 做的适配

| 位置 | 行为 |
| --- | --- |
| 顶部标题 | 按当前设备显示 **AI 小电拼 Pro** 或 **AI 小电拼 Ultra** |
| 型号 chip | 保留 `CP-02 · 160W · 5 口 · pro/ultra` |
| 设备弹窗 | 每台设备显示 **Pro / Ultra** 徽标 |
| 已保存设备 | 每次成功轮询同步 `name / psn / model / modelLabel / lastSeen`，不会缓存旧的 “Pro / Ultra” 文案 |
| 多台监看 | 可同时加入 Pro 和 Ultra；每台独立判断型号/能力，端口按 P0–P4、P5–P9… 编号 |
| 演示数据 | 2 台演示默认是一台 Pro + 一台 Ultra，专门验证混用 |
| 扫描结果 | 按设备实际 `device_model` 返回，不再硬编码 Ultra |
| 能力说明 | MCP 不按型号锁；本地 MQTT / PD 详情按 license feature bit 说明 |

---

## 3. 官方 Pro/Ultra 差异

官方对比表（[CANDYSIGN 微博](https://weibo.com/2/detail/5346721887423088)）：

| 项目 | Pro | Ultra |
| --- | --- | --- |
| 硬件 | 160W、4C1A、C 口 140W、A 口 60W | 相同 |
| 状态屏颜色 | 金珀色 | 琥珀色 |
| AI 充电系统 | FluxAI 自由流 2.0 | 2.0 + **Premium Kit** |
| 龙虾服务 / MCP | ✅ | ✅ |
| 糖码升级 | 可升级 Ultra | — |

**关键结论：MCP/龙虾服务不是 Ultra 专属**；官方表里两者都支持。
自定义 MQTT broker、`/metrics.json` PD 详情等由 **license feature bit** 控制，
更接近 Ultra/糖码能力，而不是简单的 `device_model` 判断。

---

## 4. 能力与授权

固件 `feature_bits.h`：

```cpp
enum Feature : uint8_t {
  MQTT_BROKER_CONFIG = 0,
  METRICS_JSON_PD_STATUS = 1,
};
```

| 能力 | 本机 CP-02 Pro 实测 | 判断方式 |
| --- | --- | --- |
| 局域网功率/电压/电流/协议/历史 | ✅ | 无需授权 |
| 温度/品牌/电池/线材 | ❌ LAN 无字段；需 MCP | MCP 授权 |
| `pd_status` 详情 | ❌ Pro 2.2.0 为 `null` | 疑似 `METRICS_JSON_PD_STATUS` feature |
| 自定义 MQTT broker | ❌ `setbrokerz` 403 `Feature is disabled` | 疑似 `MQTT_BROKER_CONFIG` feature |
| MCP 读写 | 取决于小程序「龙虾服务」授权 | 官方账号/设备授权 |

Pro 可通过糖码升级；升级后 feature bit/型号可能变化，需要重新读取设备状态，不要只看旧缓存。

详见 [MQTT-AND-LICENSING.md](MQTT-AND-LICENSING.md)。

---

## 5. 混合多台时怎么工作

- 单台模式：当前设备独立显示。
- 多台模式：每台设备一张卡片/一组端口；`device.index` 决定全局端口号：
  - 机 1：P0–P4
  - 机 2：P5–P9
  - N 台：P0–P(5N-1)
- 总功率、预算（160W × 在线台数）、在充数、本次电量按在线设备汇总。
- 单台离线：保留槽位，其余设备继续显示，并提示离线主机。
- Pro/Ultra 混合时，型号徽标按设备显示；不把整页固定成某一种型号。

---

## 6. 已验证范围

| 设备 | 状态 |
| --- | --- |
| **CP-02 Pro**（固件 2.2.0，ESP32-C3，SW3566 0.3.36，FPGA 0.2.9，hw MP0） | ✅ 实机验证：单台、多台（同设备双别名）、扫描、局域网数据、Prometheus、历史、演示、UI |
| CP-02 Ultra | ⚠️ 未实机验证；按官方对比表和 feature bit 设计适配，Ultra 设备应显示 Ultra |
| CP-02S / Core / Mirror（CP-03） | ❌ 未验证；屏幕/待机/整点报时等 CP-02S 功能不在本项目范围 |
| 其他 CANDYSIGN 型号 | ❌ 未验证 |

> “测试了 CP-02”目前具体是 **CP-02 Pro / 2.2.0**。没有 Ultra 实机，不能声称 Ultra 的全部 Premium Kit 功能已实测。

---

## 7. 当前限制

- 看板只读，不调用任何控制类 MCP/MQTT 命令。
- 没有 Ultra 实机，Ultra 专属能力目前只做了显示/能力说明，没有写控制。
- 本地 MQTT broker / PD 详情在 Pro 上被 feature bit 关闭；不要强行绕过。
- MCP 接入尚未实现；拿到 MCP 地址后可按只读工具接入。
- 型号判断以设备自报为准；糖码升级后请刷新，设备列表会自动同步。

---

## 8. 相关文档

- [README](../README.md)
- [DATA-CONTRACT.md](DATA-CONTRACT.md)
- [APP-PARITY.md](APP-PARITY.md)
- [MQTT-AND-LICENSING.md](MQTT-AND-LICENSING.md)
- [在线演示](https://wzqvip.github.io/cocan-ultra-dashboard/)
