# APP-PARITY · 小电拼 App 对齐规格（设计 / 数据语义参考）

> 面向：前端工程师（UI/交互）、README 作者。
> 范围：只读局域网看板（`/metrics.json`、`/metrics`、`/porthistoryz`、`/` 首页 `__INFOZ`）。
> 不在范围：控制、温控、屏幕设置、设备识别、云统计（均需 MCP token / 官方云）。
> 数据字段的**唯一契约**是 [docs/DATA-CONTRACT.md](DATA-CONTRACT.md)；本文件负责产品事实、App 视觉对齐、图形解剖和指标语义。
> 证据分级：✅ 设备/固件源码实测 · 🟡 官方页面或评测（营销/拆解） · 🔵 社区实现对实机验证 · ⚪ 推断/未证实。
> 研究环境：`CANDYSIGN CP-02`（本机自报 `device_model=pro`），固件 `2.2.0`，`http://cp02-<PSN>.local`，2026-11-07 实读 [S1]。

---

## 1. 产品事实（哪些是实测，哪些是营销）

| 项目 | 值 | 等级 | 证据 |
| --- | --- | --- | --- |
| 零售产品名 | CANDYSIGN 制糖工厂 **AI 小电拼 Ultra / CP-02 Ultra**；同代还有 Pro（同硬件，Ultra 含 Premium 软件权益） | 🟡 | [S4][S11][S18] |
| 本机自报 | `product_family=CP02`、`device_model=pro`、`device_name=CP02-<PSN>`；MCP 文档标题为 “…Pro” | ✅ | [S1][S17] |
| 型号 | CP-02（产品族 CP02） | ✅ | [S1]；🟡 [S4] |
| 形态 | AC 延长线插座 + 可拆分随行充模块；背面 2×五孔 + 1×两孔 AC | 🟡 | [S4] |
| DC 端口 | **4×USB-C + 1×USB-A**（A、C1、C2、C3、C4） | ✅ | [S1]（`ports[0..4]`，`port_type` A/C/C/C/C） |
| 总输出 | **160 W** | ✅/🟡 | 固件默认 `CONFIG_MAX_POWER_BUDGET=160` [S2d]；官方/评测 [S4][S5] |
| 单口上限 | C1–C4 各 **140 W**；USB-A **60 W** | ✅/🟡 | Kconfig 默认 140/60 [S2e]；实读 `power_budget=140` [S1]；官方 [S5] |
| USB-C 档位 | 5V3A/5V5A/9V3A/12V3A/15V3A/20V5A/28V5A、PPS 5–21V/5A、SPR AVS | 🟡 | [S4][S5] |
| USB-A 档位 | 5V–20V@3A（最大 60 W） | 🟡 | [S4][S5] |
| 快充协议 | 21 个固件枚举值（0–20）+ 255；营销口径“22 协议”另计 Apple/BC 等 | ✅/🟡 | 枚举见 §5.2 [S2b]；🟡 [S5] |
| SoC | **ESP32-C3**（RISC-V 单核 160 MHz，2.4G Wi-Fi + BLE） | ✅ | [S1] `system.chip=esp32c3`、`cpu_freq_mhz=160`；🟡 拆解 [S4] |
| 端口 MCU | **5× 智融 SW3566H**（每口一颗），MCU 固件 **0.3.36** | ✅ | [S1] `mcu_version`；🟡 拆解 [S4] |
| FPGA | 安路 **EF2M45LG48B**，FPGA 固件 **0.2.9** | ✅/🟡 | [S1] `fpga_version`；🟡 拆解 [S4]；架构 [S8] |
| zrlib | **1.8.1** | ✅ | [S1] |
| 硬件版本 | **MP0** | ✅ | [S1] `hw_rev` |
| 颜色 | **white** | ✅ | [S1] `product_color` |
| 整机固件 | **2.2.0**（IDF v5.5.3，单核 160 MHz） | ✅ | [S1] `esp32_version`/`system.app_version` |
| 状态屏 | OLED 屏 + 能量条 LED（拆解）；CP-02 **只支持亮度调节** | 🟡/✅ | [S4]；[S17] “CP02 only supports brightness” |
| “0.5 英寸琥珀 OLED / 屏显模式 / 待机动画 / 整点报时” | 属于 **CP-02S（Mirror）**，不要在 CP-02 上承诺 | 🟡 | [S5][S17]；社区同结论 [S3 README][S13] |
| PSN | `<PSN>` | ✅ | [S1] |
| mDNS | `cp02-<PSN>.local` | ✅ | [S1] |
| 国家码 / MAC | `country_code=US`；BLE/Wi-Fi MAC 存在但本文不抄录 | ✅ | [S1]（隐私，见 §7） |

**命名注意（必须写进 README 免责）**：本机自报是 `pro`，官方 MCP 文档标题也是 “Pro”；`Ultra` 是含 Premium 软件权益的零售 SKU，硬件同为 160W 4C1A [S11]。README 建议写“AI 小电拼 Pro / Ultra（CP-02 系列）”，设备信息区显示实际自报型号，不要写死 Ultra。

**固件版本偏差**：本地公开 clone `ifanrx/IonBridge` HEAD `2372580` 的 `version.json` 是 `0.9.11`、SW3566 `0.3.16`、FPGA `0.2.8/0.2.11`；实机是 `2.2.0 / 0.3.36 / 0.2.9`。因此：协议枚举、电量换算、端口状态机等**类型定义**可引用 clone；**端点实现**（`/metrics`、`/metrics.json`）在 clone 里找不到（clone 的 web server 只注册了 `/` [S2f]），只能以实机响应为准。

---

## 2. App / 小程序功能地图（哪些能只读，哪些必须 MCP）

数据来源二分：局域网 `/metrics.json`（快，3–15 s，无鉴权）与官方 MCP（`https://mcp.thecandysign.com/<PSN>/<token>/mcp|sse`，需 token，走公网云）[S3 README][S13]。

| # | 功能 | App 行为 | 局域网能否得到 | 本看板决定 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | 功率分布图（端口卡→线→机身） | 5 口功率 / 协议 / 总功率 | ✅ 可计算 | **做**（只读复刻） | [S6][S13][S15] |
| 2 | 简洁视图（5 条横向功率线） | 颜色对应端口、长度跟随功率 | ✅ 可计算 | 可选 | [S6] 官方截图 |
| 3 | 整机总功率 | 大数字 + 在充口数 | ✅ Σ(P) | **做** | [S1][S6] |
| 4 | 每口实时 W/V/A | 数值、协议 | ✅ | **做** | [S1] |
| 5 | 协议名 | 中/英文名 | ✅ `fc_protocol` | **做**（固件名 + App 化标签） | [S2b] |
| 6 | 芯片温度档位（凉爽/温和/偏热；过热为社区推断） | 温度计圆点 + 文字 | ❌ 仅 MCP | **不做**（显示“需 MCP”） | [S17][S13] |
| 7 | 充电时长 | 本次会话时长 | ✅ `charging_duration_seconds` | **做** | [S1] |
| 8 | 本次电量 | Wh/mWh | ✅ `session_charge × 24.552` | **做**（标注估算） | [S2a][S1][S13] |
| 9 | 30 分钟曲线 | 设备内存 10 s/点 | ✅ `/porthistoryz` ≤180 点 | **做** | [S1] |
| 10 | 2 小时曲线 | App 本地记录 | 🟡 只能边开边记（localStorage） | **做，标注“仅本页打开期间”** | [S3 README][S13] |
| 11 | 充电策略：自由流/睡眠充/魔拟充/性能模式/极速单充 | 写操作 | ❌ 写 + **读不到当前策略** | **不做** | [S17][S13][S15] |
| 12 | 苹果全家桶 / 自定义策略 | 静态分配表 | ❌ MCP 不可设 | **不做** | [S13] |
| 13 | 单口开 / 关 | 开关 | ❌ 写 | **不做**（仅显示 active/state） | [S17] |
| 14 | 温控：性能温控 / 安心温控 | 读 + 写 | ❌ 仅 MCP | **不做** | [S17][S13] |
| 15 | 屏幕亮度：关/低/中/高 | 读 + 写 | ❌ 仅 MCP | **不做** | [S17] |
| 16 | 屏显模式 / 待机显示 / 整点报时 | CP-02S only | ❌ 且本机不支持 | **不做** | [S17] |
| 17 | 临时功率分配（15 W–口上限，Σ≤160） | 写；应用后全口重握手 | 🟡 只读 `power_budget` | **只读展示**，不编辑 | [S13][S17] |
| 18 | 在充设备识别（品牌/型号/电量/PD/线材） | 云 + PD 数据 | ❌ `pd_status=null` | **不做** | [S1][S13] |
| 19 | 预计充满时间 / 充电进度 | 云算法 | ❌ | **不做** | [S9][S6] |
| 20 | 全协议管理 / 自定义 PDO / 线补 / 端口类型 | 写 | ❌ | **不做** | [S7][S17] |
| 21 | 定时任务 / 配置同步 / 家庭共享 / 远程 | 云 | ❌ | **不做** | [S7][S9] |
| 22 | 设备信息（PSN/型号/固件/主机名） | 设备页 | ✅ 首页 `__INFOZ` | **做**（隐私过滤） | [S1] |
| 23 | Wi-Fi / 系统 / 任务负载 | 调试页 | ✅ `metrics.json` | 可选“设备状态” | [S1][S20] |
| 24 | NFC 跳转 / 兼容榜 / 云电量统计 / OTA / AI 接管 | 云 | ❌ | **不做** | [S9][S10][S13] |

**术语校正**：需求里写的“魔幻充”应为 **“魔拟充”**（Mimic，官方现称“小家电”）；“极速单充”官方写作 **“极速单充·C1”**；“性能模式”是 MCP 的 `HIGH_PERFORMANCE` 叫法，官方软件页现多用“自由流/睡眠充/小家电/极速单充·C1/苹果全家桶/自定义”[S6][S17]。

**必须 MCP token 的功能（一律不做）**：温度、策略（写且读不到当前值）、端口开关、温控模式、屏幕亮度/屏显、临时功率分配、PD/设备识别、历史补采、OTA、家庭共享、AI/OpenClaw 接管。token 等同设备控制密码 [S3 README][S13]；**不要**把它放进仓库、Pages、localStorage、日志或截图。

**可只读展示的 App 元素**：总功率、5 口 W/V/A、协议、充电时长、本次电量、30 分钟曲线、端口开关状态（由 `active/state` 推断）、各口功率上限、设备身份、在线/离线、数据时间。

---

## 3. 标志性功率分布图解剖（App / CoCanBar 同款）

App 里有**两种**功率可视化，不要混淆：

1. **简洁视图**：5 条横向彩色功率线（A、C1–C4，长度∝功率）+ 大数字 `160W/5` [S6 官方截图]。
2. **专业视图 / “调节”页的功率图**（本看板复刻对象）：顶部 5 个端口 chip → 5 根贝塞尔线 → 右下角机身，机身上有 5 个插槽、小屏总功率、左下大数字总功率、右下 160W 预算框 [S13 截图][S15][S3 diagram.js]。

### 3.1 端口顺序（固定）

`id 0..4 = A, C1, C2, C3, C4`（从左到右；机身上槽位同序）。这是**逻辑顺序**，不是机身物理顺序（拆解显示正面 3C1A、右侧另有 C4）[S4]。任何情况下都不得按功率重排 [S1]。

### 3.2 几何（viewBox `0 0 620 352`，来自 cocan-web；KangCharge 用 1.6 倍机身，比例一致）

| 元素 | 值 / 公式 |
| --- | --- |
| chip 宽 / 间距 | `100.8`（96×1.05）/ `10.5`（10×1.05） |
| chip 行 | `rowLeft=37`；中心 x = `87.4, 198.7, 310.0, 421.3, 532.6` |
| chip 顶部 / 盒高 / 圆角 | `15.5` / `43` / `7.35` |
| chip 内文字 | 名称 y=12（10.5px/700）；功率 y=34（15.7px/700）；分隔线 y=40.5；详情 y=52（9.4px/600） |
| 线起点 | `y=61`，每 chip 底部中点 |
| 机身 | `212.8×110.2`（112×58 ×1.9），`x=403.2, y=199.8`，`rx=20.9` |
| 机身小屏 | 局部 `(22.8,22.8)`，`57×24.7`，`rx=5.7`，文字居中 |
| 槽位 y / 尺寸 | `y=272`；A `26.6×9.5`、C `19×9.5`；中心 x=`439.3, 473.5, 503.9, 534.3, 564.7` |
| 预算框 | `x=520, y=296, w=92, h=52, rx=7`；标题 20px/800；说明 10px/600 |
| 左下角 | “实时充电功率” (0,300) 14px/600；总功率 (0,344) 48px/800，单位 32px |

线路径（cocan-web / KangCharge 相同控制点比例）：

```text
M x1,61 C x1,(61+dy*0.62) x2,(272-dy*0.55) x2,272   // dy=211
```

示例（C1）：`M198.7,61 C198.7,191.8 473.5,156.0 473.5,272`。
图层顺序：线 → 机身（含阴影）→ chip → 文案/总功率/预算框。

### 3.3 机身与屏幕

- 机身：暖白渐变 `#FFFDF7 → #EEE7D8`，描边 `#DCD3C1` 1px，阴影 `dy=7, stdDeviation=6, #000 16%`；圆角 20.9。
- 小屏：深色 `#121212`，显示**四舍五入整数** `72W`，品牌色 12.4px/800，`tabular-nums`。
- 槽位：`#121212` 82% 不透明；A 口圆角 1.9、C 口 4.75（A 口更“方”）。
- 左下：总功率保留 1 位小数（<100 W 时），100 W 以上取整；单位小一号、色 `--unit`。
- 右下预算框：`160W` + 分隔线 + `已使用 45%`（`total/160`）。这是**使用率**，不是分配率。
- 图下方状态条（App 同款）：`充电中 2/5 口 · 本次累计 29.0 Wh · 剩余功率 88.2W`（剩余=160−总功率）[S13 截图]。

### 3.4 状态 → 图形

| 状态 | 判定 | chip | 线 | 流动虚线 |
| --- | --- | --- | --- | --- |
| 关闭 | `!active` 或 `state=INACTIVE` | `OFF` + 该口上限（如 `140W`），灰边灰字 | 浅灰 | 无 |
| 空闲 | `active && !attached` | 截图口径 `0.0W` + `空闲`；cocan-web 用 `—` | 浅灰 | 无 |
| 已连接未取电 | `attached && power≈0` | `0.0W` + 协议简称或 `未取电` | 品牌橙 75% | 无 |
| 充电中 | `attached && power>0` | 功率 + 协议简称（`PD`/`USB`/`QC3`…） | 品牌橙 100% | **有** |

> 空口文案有分歧：CoCanBar 截图是 `0.0W`，cocan-web 是 `—`。本看板建议按截图用 `0.0W`，并把“空闲”写进详情行；关闭口才用 `OFF`。
>
> 这张标志图本身是**单色品牌橙**（chip 边框/文字/线）；“每口不同色”只出现在简洁视图的功率线和菜单栏功率柱 [S6][S13]。不要把端口色强行套到这张图上。

### 3.5 动画

- 虚线：`stroke:#fff; stroke-opacity:.55; stroke-width:1.75; stroke-dasharray:2 14; animation: pd-flow 1.2s linear infinite`，`to { stroke-dashoffset:-16 }`。
- 只在 `charging` 时播放；离线 / 数据过期 / `prefers-reduced-motion: reduce` 时停止（保留静态虚线或隐藏）。
- 不做“呼吸/闪烁”背景；全页最多这一处无限动画。

### 3.6 可访问性

- SVG `role="img"` + `aria-label="五路端口的功率分布"`；旁边或下方给同义文本（端口名、W、协议、状态），保证读屏可获取。
- 颜色不是唯一编码：状态/协议/数值必须同时有文字。
- 详见 §4.4 的对比度注意：App 的端口色作为白底文字不达标，数字统一用 `--ink`。

### 3.7 官方简洁视图（官网 2026-11 复核，S6）

官方软件页把功率展示分成两种视图，本看板都应对齐：

1. **简洁视图**：顶部大数字 `160W / 5`，下方 `N 台设备充电中`；五条**端口色**横向功率线，
   线长度跟随此刻实际输出。文案明确「功率线的颜色对应端口，长度跟随此刻实际输出」。
   官网配图 `figma-xdp2-simple-mode.png`（S6）。
2. **专业视图**：§3 的 chip → 贝塞尔线 → 机身功率流图；可选“重播功率流”动画。

官网另外给出「实心柱是此刻输出，浅色轮廓是端口能力」的读法；本看板在简洁视图用：

- 浅色轨道 = 端口标称上限（A 60W，C1–C4 140W）
- 实心填充 = 当前功率（按轨道比例）
- 数值仍用正文色，端口色只做图形编码（白底对比度不足，见 §4.2）

官网的「选一个今天的充法」模式列表（自由流 / 睡眠充 / 小家电 / 极速单充·C1 / 苹果全家桶 /
自定义）属于**写操作**，局域网只读接口读不到当前模式，本看板不伪造这些控件；需要控制请用官方
App / MCP。多台监看是本看板的扩展：设备 1 的端口为 P0–P4，设备 2 为 P5–P9，以此类推。

---

## 4. 设计 token 提案（对齐 App 的干净产品感，不像厂商调试页）

App 观感：奶油底、白卡片、橙红品牌、18px 大圆角、胶囊按钮、大号等宽数字、大量留白 [S13][S3b]。厂商调试页（`vendor/ionbridge.css`）是 `#1a73e8` 蓝、14px 基准、8px 圆角、密集表格 [S20]——**不要照抄**。

### 4.1 四套配色（暖/冷 × 浅/深）

| token | warm-light | warm-dark | cool-light | cool-dark |
| --- | --- | --- | --- | --- |
| `--canvas` | `#F8F5EC` | `#1C1B19` | `#F0F4F9` | `#141920` |
| `--card` | `#FFFFFF` | `#292724` | `#FFFFFF` | `#1E242C` |
| `--inset` | `#F8F5EC` | `#211F1C` | `#F0F4F9` | `#1A2028` |
| `--ink` | `#121212` | `#F3F0EA` | `#0F1826` | `#E9EFF7` |
| `--heading` | `#6E6A62` | `#A9A49A` | `#5C6B7D` | `#97A5B6` |
| `--unit` | `#B8B8B8` | `#7A766E` | `#AEBAC9` | `#6B7889` |
| `--track` | `#EFEBE1` | `#3A3733` | `#E4EBF3` | `#2E3742` |
| `--line` | `#E8E8E8` | `rgba(255,255,255,.08)` | `#E2E8F0` | `rgba(255,255,255,.08)` |
| `--brand` | `#FF4719` | `#FF4719` | `#2F7BF6` | `#2F7BF6` |
| `--online` | `#00C539` | `#00C539` | `#10B981` | `#10B981` |
| `--danger` | `#FF3B30` | `#FF3B30` | `#E5484D` | `#E5484D` |
| 阴影 | `0 1px 2px rgba(0,0,0,.04), 0 10px 28px rgba(122,90,42,.07)` | `0 1px 2px rgba(0,0,0,.3), 0 10px 28px rgba(0,0,0,.35)` | 同 warm-light（冷调 `rgba(43,59,85,.07)`） | 同 warm-dark |

机身渐变固定：`--device-top:#FFFDF7; --device-bottom:#EEE7D8; --device-edge:#DCD3C1`（深色模式也保持暖白机身）[S3b][S15]。

### 4.2 端口强调色（App 按“模式”换色；本看板读不到模式，固定自由流配色）

| 端口 | 自由流（默认，暖） | 冷色主题 | 睡眠（参考） | 极速单充（参考） | 文字安全色（暖浅底） |
| --- | --- | --- | --- | --- | --- |
| A | `#2C89FB` | `#5AC8F5` | `#4460DD` | `#46BC2C` | `#1B5FCC` |
| C1 | `#FFC444` | `#3BA4F0` | `#B787E0` | `#71CBE7` | `#8A5E00` |
| C2 | `#FFA51E` | `#2F7BF6` | `#9965C7` | `#22ADEE` | `#A65A00` |
| C3 | `#FF921E` | `#255FCC` | `#7B3FB0` | `#0381E1` | `#A64F00` |
| C4 | `#FF7315` | `#1B3F94` | `#56297E` | `#0058C4` | `#A33D00` |

- 色彩来自 App 场景配色表 [S13][S3b]；`performance` 用自由流同色。
- **本看板无法读取当前策略**，因此固定自由流配色，并在设置说明里写“配色不代表设备当前策略”。
- 端口色只做**图形编码**（线、chip 边框、柱、图例圆点）；功率数字一律 `--ink`。原因：这些亮色在白底上对比度只有 1.6–3.5:1（C1–C4 全部 <3:1），不满足 WCAG 4.5:1 文本要求；需要彩色文字时用上表最后一列（推导值，非 App 原色）。深色模式下原色大多 ≥4.5:1，仅 A/品牌橙略低，链接/文字可用 `#6FA5FF` / `#FF7A4D`。
- 冷色浅底同理，文字安全色可用：A `#1D5BC4`、C1 `#0B6E9E`、C2 `#1668B3`、C3 `#1B5FA8`、C4 `#075A96`（推导值）。

### 4.3 字体、圆角、间距、阴影、动效

| 类别 | 提案 |
| --- | --- |
| UI 无衬线 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif` |
| 数字 | `ui-monospace, "SF Mono", Menlo, Consolas, "Cascadia Mono", monospace`；一律 `font-variant-numeric: tabular-nums` |
| 字号 | 总功率 48/52（移动端 40）；H1 20/28 600；H2 15/22 600；正文 14/21；辅助 12.5/18；微文字 10.5/14 700（仅英文/数字） |
| 圆角 | 卡片 18；子卡 12；输入/小按钮 8–9；胶囊 999；图形机身 20.9；chip 7.35 |
| 间距 | 4 基：4/6/8/10/12/16/20/24/32；页面 16（≤560px 用 12）；卡片内 16–20；区块间 16 |
| 阴影 | 见 §4.1；机身专用 `dy=7 std=6 16%`；禁止重投影/发光 |
| 动效 | 150–300 ms（App 实际多用 150–250），`cubic-bezier(.4,0,.2,1)`；虚线 1.2 s linear；`prefers-reduced-motion` 下全部 ≤0.01 ms；不做入场大动画 |
| 断点 | 560 / 1000；内容最大宽 720（单列）/ 1080（双列） |

CSS 骨架：

```css
:root {
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC",
             "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
  --font-num: ui-monospace, "SF Mono", Menlo, Consolas, "Cascadia Mono", monospace;
  --r-lg: 18px; --r-md: 12px; --r-sm: 8px; --r-pill: 999px;
  --sp-3: 8px; --sp-6: 16px; --sp-8: 24px;
  --dur: 200ms; --ease: cubic-bezier(.4, 0, .2, 1);
  --port-a: #2C89FB; --port-c1: #FFC444; --port-c2: #FFA51E;
  --port-c3: #FF921E; --port-c4: #FF7315;
}
body { font-family: var(--font-ui); background: var(--canvas); color: var(--ink); }
.num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

### 4.4 与厂商调试页的差异（验收清单）

- 不用 `#1a73e8` 作为主色；不用 14px 全局基准；不用密集 `<table>` 展示端口。
- H1 不用蓝色下划线；卡片必须有 18px 圆角和暖色阴影。
- 端口用“chip / 卡片 / 胶囊”，不是表格行。
- 数字用大号等宽；单位小一号、`--unit` 色。
- 空状态/离线用“灰 + 文案”，不用红色报错墙。

---

## 5. 指标语义（前端与 README 都按这里写）

### 5.1 端点与覆盖差异

| 端点 | 形状 | 覆盖 | 备注 |
| --- | --- | --- | --- |
| `GET /` | HTML + `window.__INFOZ` / `__ENDPOINTS` / `__CONFIG` | 设备身份、固件、能力列表 | 用正则提取 `__INFOZ`；PSN 用于核对设备 [S1][S3e] |
| `GET /metrics.json` | JSON | 端口：id/active/state/port_type/attached/charging_duration_seconds/fc_protocol/current/voltage/vin_value/session_id/session_charge/power_budget/pd_status；system：chip/cores/cpu_freq_mhz/idf_version/app_version/boot_time_seconds/reset_reason/free_heap；wifi；tasks | **首选**；无 PM/UART/MQTT 计数器；`pd_status` 在 2.2.0 上恒为 `null` [S1] |
| `GET /metrics` | Prometheus 文本 | 每口 `port_state`(1/0)、`fc_protocol`、`current`(mA)、`voltage`(mV)；另含 boot/free_heap/pm/light_sleep/uart/mqtt/task/uptime/wifi_signal | **无** port_type、attached、state 字符串、charging_duration、session_charge、vin_value、power_budget、pd_status、app_version [S1] |
| `GET /porthistoryz?limit=N` | JSON | `{sample_period_ms:10000, ports:[{port,samples:[{voltage,current}]}]}`；最多 180 点≈30 min；断电清空 | 无功率字段，需自算；`limit` 再大也只回 180 [S1] |
| `/infoz` `/fpgaz` `/budgetz` | — | 2.2.0 上 **404** | 不要依赖；`__ENDPOINTS` 也没有 [S1] |

**为什么必须本地代理**：设备 HTTP 响应**不带 `Access-Control-Allow-Origin`**（实测响应头只有 `Content-Type`、`Content-Length`）[S1]，浏览器直接 `fetch` 会被 CORS 拦；由 `server.mjs` 同源代理 [S3 README][S3e]。第三方 `cp02_monitor` 也直接轮询 `/metrics`（500 ms）[S16]，说明 Prometheus 端点适合低频采集，但字段比 JSON 少。

> 2.2.0 还暴露 `/setbrokerz`、`/destroymqttz`、`/startmqttz` 等端点，但由 license feature bit
> （`MQTT_BROKER_CONFIG`、`METRICS_JSON_PD_STATUS`）控制；本机 Pro 实测 `setbrokerz`
> 返回 403 `Feature is disabled`，`pd_status` 为 null。完整记录见
> [MQTT-AND-LICENSING.md](MQTT-AND-LICENSING.md)。

### 5.2 `fc_protocol` 表（固件 `FastChargingProtocol`，0–20 + 255）

| code | 固件名 | 建议 UI 文案 | 说明 |
| --- | --- | --- | --- |
| 0 | `FC_None` | USB 普通 / `USB` | 无快充协议；有电压时即 USB Legacy 5V（App 也显示 `USB 5V`）[S3c] |
| 1 | `FC_QC2` | QC2.0 | |
| 2 | `FC_QC3` | QC3.0 | |
| 3 | `FC_QC3P` | QC3+ | |
| 4 | `FC_SFCP` | SFCP | |
| 5 | `FC_AFC` | AFC | 三星 |
| 6 | `FC_FCP` | FCP | 华为 |
| 7 | `FC_SCP` | SCP | 华为 |
| 8 | `FC_VOOC1P0` | VOOC 1.0 | |
| 9 | `FC_VOOC4P0` | VOOC 4.0 | |
| 10 | `FC_SVOOC2P0` | SuperVOOC 2.0 | |
| 11 | `FC_TFCP` | TFCP | |
| 12 | `FC_UFCS` | UFCS | 融合快充 |
| 13 | `FC_PE1` | PE 1.0 | |
| 14 | `FC_PE2` | PE 2.0 | |
| 15 | `FC_PD_Fix5V` | PD 5V | 固定 5V |
| 16 | `FC_PD_FixHV` | PD 固定高压 | 9/12/15/20V；实机 C1/C3 当前=16 [S1] |
| 17 | `FC_PD_SPR_AVS` | PD SPR AVS | |
| 18 | `FC_PD_PPS` | PD PPS | |
| 19 | `FC_PD_EPR_HV` | PD EPR | |
| 20 | `FC_PD_AVS` | PD AVS | |
| 21 | （不在公开 clone 枚举） | PD 小米 PPS | 社区表有 21；新固件可能新增，勿写死 |
| 255 | `FC_NOT_CHARGING` | 未充电 | 0xff |

> 注意：`DATA-CONTRACT.md` 当前把 code 0 标为“未充电”，与 App/实机语义冲突。建议对齐为 **0=USB 普通（无快充）/ 255=未充电**；请 Lead 确认后统一。

### 5.3 字段与换算

| 字段 | 单位 | 语义 / 公式 | 实机示例（2026-11-07） |
| --- | --- | --- | --- |
| `voltage` | mV | 端口输出电压 | C1 `9080` → 9.08 V |
| `current` | mA | 端口输出电流 | C1 `1677` → 1.677 A |
| `power` | W | `voltage × current / 1e6` | C1 `15.22 W`；C3 `22.60 W`；合计 `37.82 W` |
| `fc_protocol` | enum | 见 §5.2 | C1/C3 = 16（PD 固定高压） |
| `charging_duration_seconds` | s | 当前会话已持续秒数；无会话=0 | C1 `563`；C2 `547`（已连接未取电） |
| `session_id` | int | 本次插入会话号；拔插后变 | C1–C3 都是 `6` |
| `session_charge` | 原始计数 | **× 24.552 = µWs**；`/3.6e9 = Wh`；`/3.6e6 = mWh` | C1 raw `467375883` → `3.1875 Wh`；C2 raw `1081373` → `0.0074 Wh` |
| `vin_value` | mV | 端口级 DC 输入母线电压（非 USB VBUS、非 AC 输入） | 全口 `29750–29880` ≈ 29.8 V（对应内部 ~28 V 轨，推断） |
| `power_budget` | W | 该口当前**分配上限**（≠ 实时功率，≠ 整机预算） | C1–C3 `140`；空口/关闭 `0` |
| `active` | bool | 端口功能是否开启/初始化 | 实机 5 口均 `true` |
| `attached` | bool | 是否插入设备 | A/C4 `false`；C1–C3 `true` |
| `state` | string | 固件端口状态机，见 §5.4 | `ACTIVE` / `ATTACHED` |
| `port_type` | string | `A` / `C` | A=id0；C1–C4=id1–4 |
| `pd_status` | object/null | PD 协商详情；2.2.0 实测恒 `null` | 不要依赖 |
| `system.boot_time_seconds` | s | 实为“开机以来秒数”（uptime），命名有误导 | `4494` |
| `system.reset_reason` | int | 复位原因码 | `3` |
| `system.free_heap` | byte | 剩余堆 | `40564` |
| `wifi.rssi` | dBm | 信号强度 | `-45` |

**电量换算的交叉验证**：24.552 来自 `sw3566_data_types.h` 注释 `1 × 8 mV × 3 mA × 1.023 s = 24.552 µWs` [S2a]；换算得 `1 mWh ≈ 146,628` 原始计数，与 CoCanBar 在 CP02 Pro 2.2.0 实测的 `146,617–148,553` 一致 [S13]。因此 README 可写“由 `session_charge` 换算的估算电量，误差约 ±5%”，不要写成设备直报 Wh。

**整机预算 160 W 不是 `/metrics.json` 字段**：局域网只能读每口的 `power_budget`（分配上限）；总预算来自固件默认/官方标称（MCP `get_machine_facts` 可读）[S2d][S17]。因此功率图右下“160W / 已使用 %”要标注“标称 160 W（配置值）”，或允许用户覆盖；不要声称这是设备实时上报的总预算。

### 5.4 端口状态机（`state`）

`UNKNOWN, BOOTING, ACTIVE, INACTIVE, ATTACHED, DETACHING, OPENING, CLOSING, OVER_TEMP_WARNING, OVER_TEMP_ALERT, COOLING, CHECKING, RECOVERING, DEAD, LIMITED_POWER`（枚举名 `POWER_LIMITING`，字符串输出 `LIMITED_POWER`）[S2c]。

- `ACTIVE`：口已开启，未接设备（或刚复位）。
- `ATTACHED`：已插入设备（可能在充，也可能未取电）。
- `INACTIVE`：口被关闭（固件 `PortClosingState` → `INACTIVE`）[S2c]。
- 其余为过程/保护态，UI 应原样保留并优先提示（不要硬映射成“充电中”）。
- 关闭后 `active` 是否变 `false` 未实测（社区也标注未确认 [S13]）；只读看板按 `state=INACTIVE → 已关闭` 处理，`active` 仅作辅助。

### 5.5 数据新鲜度与读取策略

- 建议轮询 `/metrics.json` **3 s**；连续 2 次失败才判定离线（社区做法）[S3c]。设备端历史固定 10 s/点。
- 设备内存只保留约 30 min；2 h 曲线需前端用 localStorage 累积（10 s 一点，最多 7200 s），刷新可恢复，换浏览器丢失 [S3c][S13]。
- 每次读 `/` 的 `__INFOZ` 核对 PSN，避免 IP 变化后显示另一台设备 [S13]。
- 局域网接口**无鉴权**：同一 Wi-Fi 任何人都能读 [S13]；本看板只读，不扩大权限。

---

## 6. 屏幕与布局建议（推荐，不是 App 事实）

| 断点 | 布局 |
| --- | --- |
| 竖屏手机 `<560px` | 单列；顶栏（设备名/在线/总功率）→ 总功率 hero → 功率图（紧凑版）→ 5 口列表 → 系统信息折叠。页面 12px 边距。 |
| 横屏手机（高 ≤430px） | 左右 55/45：左功率图，右端口列表；底部抽屉放详情；顶栏压缩为 48px。 |
| 平板 / 桌面 `≥1000px` | 内容 max 1080；左 1.4fr（图 + 端口列表 + 曲线），右 1fr（设备信息/系统/说明）；图按 620px 1:1 渲染。 |

- **安全区**：`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`；顶栏 `padding: calc(12px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))`；底部 `padding-bottom: calc(24px + env(safe-area-inset-bottom))`；用 `100dvh` 不用 `100vh`。
- **单手**：主要操作（刷新、切换主机、主题、展开端口详情）放在底部 1/3 或顶栏右上；端口行整行可点（≥44px 高），详情用底部抽屉（`max-height:80dvh`、拖拽条、关闭按钮）。只读看板没有破坏性操作，不要放浮动“电源”按钮。
- **图在手机上的缩放**：`viewBox 620×352` 缩到 358px 时 chip 名称只有 ~6px，不可读。规则：容器 ≥560px 用完整版 1:1；<560px 用紧凑版（建议 `viewBox 0 0 360 260`，chip 64×56、名称 11px、功率 18px、隐藏协议详情行，机身 112×58 放右下，总功率 hero 在 SVG 外）。若坚持同一 viewBox，必须隐藏详情行并把 chip 内字号放大到渲染后 ≥9px。
- **状态**：`offline`（灰 + “读不到设备，检查同一 Wi-Fi”）、`stale`（>15 s 未更新，时间标橙）、`demo`（“演示数据”徽标）、`unsupported`（需 MCP 的字段显示“需 MCP”，不显示 0）。
- **无障碍**：焦点环可见；图表有文本替代；`aria-live="polite"` 只播报“总功率/在充口数”，并节流 ≥5 s；数字与单位之间用 `&nbsp;`。

---

## 7. 风险与不确定（诚实清单）

1. **命名**：本机自报 `pro`，评测商品名 `Ultra`；不要写死 Ultra（§1）。
2. **固件 clone 落后**：公开 clone 0.9.11 vs 实机 2.2.0；`/metrics`、`/metrics.json` 的实现不在 clone 里，端点细节只能实测。
3. **`pd_status` 恒 null**：2.2.0 的 `/metrics.json` 不提供 PD；识别/温度/线材只能 MCP。
4. **关端口后的上报**：`active`/`state` 未实测；按 `INACTIVE` 推断。
5. **温度**：局域网没有；不要用 `vin_value` 或功率猜温度。
6. **协议 21**：公开固件枚举没有；新固件可能新增，未知值显示 `未知 (n)`。
7. **CP-02 vs CP-02S**：屏显模式/待机动画/整点报时是 CP02S；本机只有亮度（且亮度也要 MCP）。
8. **电量换算**：经验系数，±5%；会话号变化后旧值不应继续累加。
9. **2 小时曲线**：只在页面打开期间记录；设备内存只有 30 min。
10. **隐私**：PSN、MAC、Wi-Fi SSID、mDNS 主机名都是设备/网络标识；公开仓库、GitHub Pages、截图、README 示例中请用占位符（`cp02-<PSN>.local`、`AA:BB:…`、`<SSID>`）。MCP token 绝对不能入库。
11. **安全**：局域网只读接口无鉴权；本地代理若绑 `0.0.0.0`，同网段可读；默认只绑 `127.0.0.1`。
12. **官方归属**：本项目非官方；CANDYSIGN/制糖工厂/小电拼/CoCan/FluxAI 是厂商标识 [S14]。

---

## 8. 来源

| ID | 来源 | 说明 |
| --- | --- | --- |
| S1 | 实机 `http://cp02-<PSN>.local`（2026-11-07）：`/`、`/metrics.json`、`/metrics`、`/porthistoryz?limit=1000` | 响应头确认无 CORS；`__INFOZ`/`__ENDPOINTS` |
| S2 | 本地 `ref/IonBridge`（github.com/ifanrx/IonBridge，HEAD `2372580`） | `components/chip_data_types/include/sw3566_data_types.h`、`data_types.h`、`components/port/include/port_state.h`、`components/port/Kconfig.projbuild`、`components/power/Kconfig.projbuild`、`components/web_server/server.cpp`、`docs/MQTT Communication Protocol.md` |
| S3 | 本地 `ref/cocan-web`（github.com/hwisdom-jpg/cocan-web，HEAD `33c5530`，MIT） | `public/diagram.js`（几何）、`public/style.css`（token）、`public/core.js`（协议/策略/MCP 工具）、`README.md`、`server.mjs` |
| S4 | https://www.chongdiantou.com/archives/1754016830913.html | 充电头网 CP-02 Ultra 拆解（芯片、接口、铭牌） |
| S5 | https://thecandysign.com/cocan/en/specs/ | 官方规格（160W、4C1A、140W、60W、0.5" OLED、22 协议） |
| S6 | https://thecandysign.com/cocan/zh/software/ | 官方软件页（简洁/专业视图、5 口能力表、MCP） |
| S7 | https://thecandysign.com/cocan/zh/customization/ | 官方个性化（自由流/睡眠充/小家电/极速单充·C1、Pro/Ultra） |
| S8 | https://thecandysign.com/cocan/zh/architecture/ | CanOS 2.0 分层、FPGA/协议 OTA |
| S9 | https://www.ifanr.com/1612296 | 开源 CanOS/IonBridge、MCP/MQTT、Prometheus Exporter 计划 |
| S10 | https://www.ifanr.com/1621892 | App 公测（专业/简洁模式、充电进度、设备识别、NFC） |
| S11 | https://www.ifanr.com/1610985 | Pro/Ultra 发布（160W、4×140W、A 60W、价格/权益） |
| S12 | https://github.com/ifanrx/IonBridge | 官方固件仓库 |
| S13 | https://github.com/yangyihang96/CoCanBar（MIT） | `Sources/CoCanStyle/Style.swift` 调色板/ModeColors；README 的 MCP 工具、温度档位、曲线、电量校准 |
| S14 | https://github.com/hwisdom-jpg/cocan-web | 社区网页版（MIT），即本地 ref |
| S15 | https://github.com/LeiZiKang/KangCharge（MIT） | `Shared/CableDiagram.swift` 几何/动画/机身画法；“18 个 MCP 工具” |
| S16 | https://github.com/ypwhs/cp02_monitor | 第三方 ESP32 监控：`/metrics` 500ms、160W/140W 常量 |
| S17 | https://mcp.thecandysign.com/<PSN>/SKILL.md | 本机 MCP 官方说明（模型 Pro、工具、策略值、CP02 只支持亮度、温度档位、单位） |
| S18 | https://www.chargerlab.com/teardown-of-candysign-160w-cocan-ultra/ | 英文拆解（交叉参考） |
| S19 | https://faq.thecandysign.com/ | 研究时返回 503，未采用 |
| S20 | 本地 `vendor/ionbridge.css`、`vendor/page-dashboard.js`、`vendor/page-procz.js` | 设备自带调试页（S3 上的官方静态资源）：`/metrics.json`、`/porthistoryz`、轮询 30 s、`--blue #1a73e8` |

---

## 9. 给 README 作者的可引用结论

- 一句话：**“一个只读的局域网看板，把 CANDYSIGN 小电拼（CP-02）的 5 口实时功率、协议、电量画成 App 同款功率分布图；不需要 MCP token，也不修改设备。”**
- 可写：4C1A、160W、C1–C4 各 140W、A 60W、ESP32-C3 + 5×SW3566H + FPGA、固件 2.2.0、30 min 设备历史 + 2 h 本地曲线、无 CORS 所以需要本地 Node 代理。
- 不要写：能控温/开关端口/改策略/看设备型号/看芯片温度/看充满时间/支持 CP-02S 屏显——这些需要 MCP 或本机不支持。
- 设备名建议：`AI 小电拼 Pro / Ultra（CP-02）`；演示与截图用占位 PSN/主机名。
- 免责声明：非官方项目；商标归制糖工厂所有；只读接口无鉴权，建议只绑 `127.0.0.1`。
