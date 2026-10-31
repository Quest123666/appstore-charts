# AppPodium

一个轻量、好看的 App Store 实时榜单网页：美国 / 中国区商店，iPhone / iPad / Mac，免费榜 / 付费榜 / 畅销榜，全部应用分类与游戏子类。

A lightweight, keyless App Store charts viewer for the US and China storefronts, built for Cloudflare Pages.

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
- **后端**：Cloudflare Pages Functions（`functions/` 目录）
- **缓存**：Cloudflare Cache API + 浏览器 `localStorage` 兜底
- **部署**：Cloudflare Pages + 自定义域名
- **协议**：MIT

请求链路：

```text
浏览器 → Cloudflare Pages（静态页面 + /api 函数代理）→ Apple iTunes RSS / Lookup
```

代理层负责参数白名单校验、字段裁剪、安全 URL 校验和边缘缓存，避免把接口变成任意 URL 代理。

## 本地运行

要求：Node.js 18+。

```bash
npm install
npm run dev
```

打开 <http://localhost:8788>。

`wrangler pages dev` 会自动识别仓库根目录下的 `functions/`，因此本地即可测试真实的 `/api/charts` 与 `/api/app`。

## 部署到 Cloudflare Pages

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

### 推荐：Git 集成（自动部署）

1. 将本仓库推送到 GitHub（公开或私有均可）。
2. 登录 Cloudflare Dashboard，进入 **Workers & Pages → Create → Pages → Connect to Git**。
3. 选择你的仓库。
4. 构建配置填写：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`public`
5. 点击 **Save and Deploy**。
6. `functions/` 会被自动编译为 Pages Functions；不需要配置任何环境变量或密钥。

> 不要填写 `npm run build`，本项目不需要构建步骤。

### 可选：Wrangler 命令行直传

```bash
npx wrangler login
npx wrangler pages project create app-podium
npx wrangler pages deploy public --project-name app-podium
```

请在**仓库根目录**执行，Wrangler 会自动把根目录下的 `functions/` 一并上传。Cloudflare 控制台的拖拽上传不支持 Functions，因此不要使用拖拽方式。

### 绑定个人域名

1. 进入 Cloudflare Dashboard 的 Pages 项目。
2. 打开 **Custom domains**，点击 **Set up a custom domain**。
3. 输入你的域名（例如 `charts.example.com`）。
4. 如果域名已经托管在 Cloudflare，DNS 会自动配置；否则按提示在你的 DNS 服务商添加记录。
5. 等待证书签发完成即可访问。

代码中不包含任何域名、账号 ID 或个人信息；域名只需在 Cloudflare 控制台绑定。

## 配置

- **页脚 GitHub 链接**：编辑 `public/app.js` 顶部的 `CONFIG.repoUrl`。留空时页面不会显示仓库链接，也不会暴露任何账号信息。
- **默认视图**：编辑 `public/app.js` 的 `DEFAULT_STATE`（默认中国区、iPhone、免费榜）。
- **配色与字体**：编辑 `public/styles.css` 顶部的 CSS 变量。
- **客户端刷新间隔**：编辑 `public/app.js` 中的 `AUTO_REFRESH_MS`。
- **服务端缓存时长**：编辑 `functions/api/charts.js` 中的 `CACHE_SECONDS`。

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
├── public/                 # 静态页面与前端资源
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── theme.js
│   ├── icon.svg
│   ├── _headers             # CSP 与安全响应头
│   ├── robots.txt
│   └── 404.html
├── functions/
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
