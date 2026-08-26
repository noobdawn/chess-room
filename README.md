# 我们的国际象棋

一个给两个人玩的联机国际象棋网页应用。纯静态前端，无需注册账号：先打开网页的人执白（先手），后打开的人执黑，棋局通过 Firebase Realtime Database 在两端同步。

## 功能

- 双人联机对局：云端同步，谁先打开谁执白，对方离开时自动释放座位
- 完整规则：合法走法校验（chess.js 引擎）、将军/将杀、逼和、升变、三次重复与五十步规则
- 黑方视角自动翻转棋盘
- 交互提示：合法走法圆点、可吃子圆环、最后一步高亮、被将军高亮
- 着法列表（最近 20 步）+ 「再来一局」

## 技术栈

- [Vite](https://vitejs.dev/) + TypeScript（无框架的前端工程）
- [chess.js](https://github.com/jhlywa/chess.js)：走子规则引擎
- [Firebase Realtime Database](https://firebase.google.com/docs/database)：联机同步
- 棋子素材：lichess [cburnett 棋子集](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett)

## 本地开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 构建产物到 dist/
npm run preview  # 预览构建产物
```

首次运行前，需要先把 Firebase 项目配置填入 `src/firebase.config.ts`（未配置时页面会显示配置引导页，属正常现象）。

## 部署

这是一个纯静态应用，可以部署到任意静态托管平台（GitHub Pages、Cloudflare Pages、Vercel 等均支持），仓库自带 GitHub Actions 自动构建部署工作流（`.github/workflows/deploy.yml`）。

> 详细的部署步骤（含 Firebase 项目创建、规则设置、Pages 开启）见本地文件 `部署说明.md`，不随仓库公开。

## 用法

两人访问同一个网址即开始对局：

- **先手/后手**：先打开网页的人执白（先手），后打开的人执黑
- **走子**：点自己的棋子选中，再点目标格子完成走子；点自己另一枚棋子可切换选中
- **升变**：兵走到对方底线时弹出选择框，选 后/车/象/马
- **再来一局**：对局结束后白方点击即开新局，座位不变
- **换房间**：网址加 `?room=任意词` 开独立房间，默认房间为 `love`。用一个长随机房间名可以当共享口令，防止陌生人加入你们的对局
- **断线**：关掉网页自动释放座位，对方会看到「对方离开」；重新打开自动恢复你的座位
