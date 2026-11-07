# 从 GitHub Pages 连接本地设备

> 结论先行：**Chrome 的 Local Network Access 权限弹窗可以解决 HTTPS 页面访问本地 HTTP
> 的权限/混合内容问题，但它不会绕过 CORS。** 这台 CP-02 的 HTTP 服务没有
> `Access-Control-Allow-Origin`，`OPTIONS` 预检返回 405，所以 **Pages 不能直接读取设备
> `/metrics.json`**；必须经本地代理。

---

## 1. 为什么不能直连设备

对设备做跨域读取时，浏览器会先发 `Origin`，并在非简单请求时发 `OPTIONS` 预检。

实测：

```bash
curl -i -H "Origin: https://wzqvip.github.io" \
  http://cp02-<PSN>.local/metrics.json
```

响应只有：

```text
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: ...
```

**没有** `Access-Control-Allow-Origin`。

预检：

```bash
curl -i -X OPTIONS \
  -H "Origin: https://wzqvip.github.io" \
  -H "Access-Control-Request-Method: GET" \
  http://cp02-<PSN>.local/metrics.json
```

结果：

```text
HTTP/1.1 405 Method Not Allowed
```

因此无论是否允许本地网络，`fetch` 的响应都会被 CORS 拦截；`mode:'no-cors'` 只能拿到
opaque response，读不到 JSON。`/metrics.json` 也不支持 JSONP。

### Chrome Local Network Access 做了什么

- Chrome 142+ 对公网页面访问私有网络/本机服务增加权限弹窗；
- 它可以把 `http://` 私有地址/`.local` 从混合内容限制中豁免；
- 但 **CORS 仍然独立生效**，设备必须返回 `Access-Control-Allow-Origin` 才能被 JS 读取。

参考：[Chrome: New permission prompt for Local Network Access](https://developer.chrome.com/blog/local-network-access)。

---

## 2. 推荐方式：Pages 页面 + 本地代理

看板支持从 Pages 页面连接本机 `server.mjs`，由代理加 CORS 并读取设备：

```
Pages (HTTPS) ──fetch──► http://127.0.0.1:8787/api/snapshot ──HTTP──► 设备
                    ↑ Chrome LNA 权限             ↑ 代理加 CORS
```

### 步骤

1. 在本机启动代理（Windows 双击 `start.bat`，或命令行）：
   ```bash
   node server.mjs --host cp02-<PSN>.local
   ```
   终端会打印实际端口（默认 8787，被占用会自动顺延）。
2. 打开 Pages 页面，点击演示横幅里的 **「连接本地设备」**，或直接访问：
   ```text
   https://wzqvip.github.io/cocan-ultra-dashboard/?local=1
   ```
3. Chrome 询问本地网络权限时点 **允许**。
4. 页面通过 `http://127.0.0.1:8787` 读取真机；如果代理端口不是 8787：
   ```text
   https://wzqvip.github.io/cocan-ultra-dashboard/?api=http://127.0.0.1:8788
   ```

### 说明

- `?local=1` 只改变数据来源，不绕过设备 CORS；真正读设备的是本机代理。
- 代理只绑定 `127.0.0.1` 时，Pages 里的请求只会到你本机；不会把设备暴露给公网。
- 代理的 `/api/*` 只对以下 Origin 返回 CORS 头：
  - `https://wzqvip.github.io`（GitHub Pages）
  - `http://127.0.0.1:<port>` / `http://localhost:<port>`（本地调试）
- 页面会显示「本地代理模式」提示；首次请求或点“重试”会触发 Chrome 权限弹窗。
- 如果代理没启动，页面会提示先运行 `node server.mjs`；这不是设备离线。

---

## 3. 如果一定要直连设备

只有三条路：

1. **给设备固件加 CORS**：在 `/metrics.json`、`/porthistoryz` 等响应加
   `Access-Control-Allow-Origin` 并处理 `OPTIONS`；需要改固件/OTA，不属于本项目。
2. **浏览器扩展/启动参数**：扩展有 host 权限，或 Chrome 用
   `--disable-web-security` 启动（不安全，不推荐）。
3. **本地代理**：本项目采用的方式。

Chrome 权限弹窗本身不能替代 CORS；不要指望点“允许”后 Pages 就能直接读
`http://192.168.x.x/metrics.json`。

---

## 4. 安全

- 代理默认只听 `127.0.0.1`；`--lan` 会暴露给同一局域网且无鉴权。
- CORS 白名单不包含其他公网站点；但 CORS 不是鉴权，不要把代理放到公网。
- 设备 `/metrics*` 本身无鉴权；这是固件行为，本项目没有扩大权限。
- 不要为图方便长期用 `--disable-web-security` 的 Chrome 配置。

---

## 5. 已实现与验证

- `server.mjs` 的 `/api/*` 已支持 `OPTIONS` 和 CORS 白名单。
  - `curl -H "Origin: https://wzqvip.github.io" /api/health` 返回
    `access-control-allow-origin: https://wzqvip.github.io`；
  - `OPTIONS /api/snapshot` 返回 204。
- 页面支持 `?local=1` / `?api=<url>`，并在演示横幅提供“连接本地设备”入口。
- **本地同源模式已验证可读真机**（`http://127.0.0.1:8787/?local=1`，状态“实时”）。
- **Pages 跨域路径已验证**：在允许本地网络的测试 Chrome 中，Pages `?local=1` 通过
  `127.0.0.1:8787` 成功读到真机；正常 Chrome 首次请求/点“重试”会触发 LNA 权限弹窗。
- 未授权时（普通 headless Chrome）请求会被拦截，页面显示“本地代理模式”，不会崩溃。
- 设备直连仍被 CORS 阻止；这是设备端限制，不是页面代码问题。
