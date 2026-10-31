# AppPodium

一个轻量、好看的 App Store 实时榜单网页：美国 / 中国区商店，iPhone / iPad / Mac，免费榜 / 付费榜 / 畅销榜，全部应用分类与游戏子类。

A lightweight, keyless App Store charts viewer for the US and China storefronts, built for **Cloudflare Workers + Static Assets**.

> 非官方项目，与 Apple Inc. 无关联。App Store 是 Apple Inc. 的商标。

## 功能

- **两个商店**：美国区、中国区
- **三种设备**：iPhone、iPad、Mac
- **三类榜单**：免费榜、付费榜、畅销榜
- **完整分类**：全部应用分类 + 18 个游戏子类
- **榜单搜索**：在当前榜单中按应用名、开发者、分类即时搜索
- **应用详情**：点击榜单卡片查看评分、价格、版本、截图和描述
- **深色模式**：跟随系统，也可手动切换并记住选择
- **可分享链接**：商店、设备、榜单、分类状态会写入 URL
- **自动刷新**：前台每 5 分钟检查一次，服务端边缘缓存 5 分钟
- **零依赖前端**：原生 HTML / CSS / JavaScript，无构建步骤、无追踪、无 API Key
- **隐私友好**：不接入分析服务，不收集个人信息

## 数据范围

数据来自 Apple 公开的 iTunes RSS 榜单与 iTunes Lookup 详情接口，无需密钥。

| 设备 | 免费榜 | 付费榜 | 畅销榜 |
| --- | --- | --- | --- |
| iPhone | ✅ | ✅ | ✅ |
| iPad | ✅ | ✅ | ✅ |
| Mac | ✅ | — | — |

> Apple 目前没有开放 Mac 付费榜与畅销榜的 RSS 数据，页面会在 Mac 视图下禁用这两个选项并显示说明。这是数据源限制，不是前端故障。

补充说明：

- Apple RSS 的更新频率不固定，通常一天数次；所谓“实时”指页面会持续检查最新可用数据，而不是逐秒变化。
- 每个榜单最多返回 100 条（部分分类会少于 100 条）。
- 应用详情（评分、描述、截图）来自 iTunes Lookup，按需加载并缓存 1 小时。
- 榜单分类使用 Apple 的 iTunes genre ID（如 `6014` = 游戏）。

数据来源参考：

- [Apple RSS Feed Generator](https://rss.applemarketingtools.com/)
- [美国区 App Store 榜单](https://apps.apple.com/us/iphone/charts)
- [中国区 App Store 榜单](https://apps.apple.com/cn/iphone/charts)

## 技术栈

- **前端**：原生 JavaScript、CSS、HTML，无框架、无构建步骤
- **后端**：一个 Cloudflare Worker，负责 `/api/charts`、`/api/app` 与静态资源路由
- **静态资源**：`public/` 目录，通过 Workers Static Assets 上传并缓存
- **缓存**：Cloudflare Cache API + 浏览器 `localStorage` 兜底
- **安全头**：Worker 为所有响应注入 CSP、X-Frame-Options 等
- **部署**：Cloudflare Workers Builds 或 `wrangler deploy`
- **协议**：MIT

请求链路：

```text
浏览器
  → Cloudflare Worker（/api 代理 + 安全头 + 静态资源）
    → Apple iTunes RSS / Lookup
```

代理层负责参数白名单校验、字段裁剪、安全 URL 校验和边缘缓存，避免把接口变成任意 URL 代理。

> 本项目使用 Workers，不再依赖 Cloudflare Pages Functions。旧版日志里的 `npx wrangler deploy` 是 Workers Builds 的部署命令；之前的 `pages_build_output_dir` 配置会让 Wrangler 误判为 Pages 项目，现已改为 Worker + `[assets]`。

## 本地运行

要求：Node.js 18+。

```bash
npm install
npm run dev
```

打开 <http://localhost:8788>。

`wrangler dev` 会同时启动 Worker 和 `public/` 静态资源，因此本地即可测试真实的 `/api/charts`、`/api/app`、404 页面和安全响应头。

## 部署到 Cloudflare Workers

### 推送到 GitHub

在项目根目录执行（把 `<你的账号>` 换成你的 GitHub 用户名）：

```bash
git init
git add .
git commit -m "feat: AppPodium App Store charts"
git branch -M main
git remote add origin https://github.com/<你的账号>/appstore-charts.git
git push -u origin main
```

> 请勿把 Cloudflare API Token、账号 ID、个人域名、邮箱或任何密钥提交到仓库；本项目不需要这些配置。GitHub 仓库本身会展示你的账号，这是平台属性，代码中不包含个人信息。

### 在现有的 Worker 项目中部署

你的 Cloudflare 项目是 Worker（有 **Deploy command** 字段），不需要新建 Pages 项目。

1. 确认 Worker 名称与 `wrangler.toml` 第一行 `name` 一致（当前为 `appstore-charts`）。
   - 如果 Worker 叫别的名字，把 `wrangler.toml` 的 `name` 改成 Worker 的名字，或在 Cloudflare 里把 Worker 改名。
2. 在 Worker 的 **Settings → Build** 中配置：
   - **Build command**：留空，或填 `exit 0`（本项目没有构建步骤）
   - **Deploy command**：`npx wrangler deploy`
   - **Root directory**：`/`（仓库根目录）
3. 推送一次新的 commit，Cloudflare 会自动安装依赖并执行 `npx wrangler deploy`。
4. 成功后，`public/` 会作为静态资源上传，`src/worker.js` 作为入口，`/api/*` 由 Worker 处理。

> Workers Builds 要求 Cloudflare 里的 Worker 名称与 Wrangler 配置中的 `name` 完全一致；若不一致，构建会报 `Worker name requirement` 错误。

### 命令行部署（可选）

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler deploy` 会读取 `wrangler.toml`，同时上传 `src/worker.js`、`src/api/*` 和 `public/`。

### 绑定个人域名

1. 进入 Cloudflare Dashboard 的这个 Worker。
2. 打开 **Settings → Domains & Routes**。
3. 点击 **Add custom domain**，输入你的域名（例如 `charts.example.com`）。
4. 如果域名已经托管在 Cloudflare，DNS 会自动配置；否则先把域名接入 Cloudflare。
5. 等待证书签发完成即可访问。

代码中不包含任何域名、账号 ID 或个人信息；域名只需在 Cloudflare 控制台绑定。

### 常见报错

- **`Missing entry-point to Worker script or to assets directory`**：说明 Wrangler 配置既没有 `main` 也没有 `[assets]`，或项目仍是旧的 Pages 配置。当前版本已提供两者，请确认 `wrangler.toml` 与本文一致。
- **`It seems that you have run wrangler deploy on a Pages project`**：旧配置里有 `pages_build_output_dir`。当前版本已移除，请不要再执行 `wrangler pages deploy`。
- **`Worker name requirement`**：把 `wrangler.toml` 的 `name` 与 Cloudflare Worker 名称改成一致。
- **构建成功但页面 404**：确认 Deploy command 是 `npx wrangler deploy`，而不是 Pages 的部署命令；并确认 `[assets] directory = "./public"`。

## 配置

- **页脚 GitHub 链接**：编辑 `public/app.js` 顶部的 `CONFIG.repoUrl`。留空时页面不会显示仓库链接，也不会暴露任何账号信息。
- **默认视图**：编辑 `public/app.js` 的 `DEFAULT_STATE`（默认中国区、iPhone、免费榜）。
- **配色与字体**：编辑 `public/styles.css` 顶部的 CSS 变量。
- **客户端刷新间隔**：编辑 `public/app.js` 中的 `AUTO_REFRESH_MS`。
- **服务端缓存时长**：编辑 `src/api/charts.js` 中的 `CACHE_SECONDS`。

## API

### `GET /api/charts`

| 参数 | 可选值 | 默认 |
| --- | --- | --- |
| `country` | `us`、`cn` | `cn` |
| `platform` | `iphone`、`ipad`、`mac` | `iphone` |
| `chart` | `top-free`、`top-paid`、`top-grossing` | `top-free` |
| `genre` | Apple genre ID，如 `6014`、`6015`、`7001` | 全部 |
| `fresh` | `1` 时跳过边缘缓存 | — |

示例：

```text
/api/charts?country=cn&platform=iphone&chart=top-free&genre=6014
```

Mac 的 `top-paid` / `top-grossing` 会返回 `400 CHART_UNAVAILABLE`。

### `GET /api/app`

| 参数 | 说明 |
| --- | --- |
| `id` | 数字 App ID |
| `country` | `us`、`cn` |
| `platform` | `iphone`、`ipad`、`mac`（用于选择 iPad 截图） |

示例：

```text
/api/app?id=1485191072&country=cn&platform=iphone
```

## 隐私

- 站点代码不接入 Google Analytics、统计 SDK 或广告。
- 不设置 Cookie，不主动收集账号、邮箱等任何个人信息；Cloudflare 平台本身可能按其政策记录请求日志。
- 浏览器仅使用 `localStorage` 保存：主题偏好、最近 8 个榜单视图的缓存。
- 清除浏览器站点数据即可删除这些本地记录。
- 所有应用链接均跳转到 Apple 的 App Store 页面。

## 目录结构

```text
.
├── public/                  # 静态页面与前端资源
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── theme.js
│   ├── icon.svg
│   ├── robots.txt
│   └── 404.html
├── src/
│   ├── worker.js            # Worker 入口、静态资源路由、安全头
│   └── api/
│       ├── charts.js        # 榜单代理 + 边缘缓存
│       └── app.js           # 应用详情代理
├── wrangler.toml
├── package.json
├── LICENSE
└── README.md
```

## 免责声明

本项目仅用于学习和展示 App Store 公开榜单数据，不提供下载、不修改排名、不代表 Apple 的观点。排名和评分均以 App Store 实时页面为准。

## License

[MIT](./LICENSE)

Copyright (c) 2026 AppPodium contributors
