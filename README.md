# 我们的国际象棋

一个给两个人玩的联机国际象棋。纯静态前端，部署在 GitHub Pages，联机走 Firebase Realtime Database 云端中转。

两人访问同一个网址就能对局：先打开网页的人执白（先手），后打开的人执黑。关掉浏览器会自动释放座位，对方能看到「对方离开」。

## 技术栈

- Vite + TypeScript（纯前端，无框架）
- [chess.js](https://github.com/jhlywa/chess.js) 负责规则引擎
- [Firebase Realtime Database](https://firebase.google.com/docs/database) 负责联机中转
- 棋子素材来自 lichess 的 [cburnett 棋子集](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett)
- 部署到 GitHub Pages（通过 GitHub Actions 自动构建发布）

## 本地开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 构建产物到 dist/
npm run preview  # 预览构建产物
```

> 在填好 Firebase 配置之前，打开页面会显示一个全屏引导页，这是正常的。

## 上线三步

### 第一步：创建 Firebase 项目

1. 打开 [console.firebase.google.com](https://console.firebase.google.com)，用 Google 账号登录，点「添加项目」，名字随意（比如 `chess-room`），一路下一步。
2. 项目建好后，左侧菜单 **Build → Realtime Database → 创建数据库**。区域选离你们近的（比如 `asia-east1` 新加坡），安全规则选「测试模式」（锁定模式也行，后面会改）。数据库 URL 形如 `https://chess-room-default-rtdb.firebaseio.com`，记下来。
3. 设置数据库安全规则。左侧 **Realtime Database → 规则**，粘贴下面这段后点「发布」：

   ```json
   {
     "rules": {
       "rooms": {
         "$room": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
   ```

   > 这套规则允许任何人读写 `/rooms/...` 路径。对你们两个人用完全够，但**不要**把这个数据库 URL 公开分享给别人——别人知道房间名就能进来捣乱。想更安全可以把规则收紧到只允许特定 UID，但对两个人用没必要。

4. 拿到 Web 应用配置：项目设置（齿轮图标 → 项目设置）→ 「你的应用」→ 添加应用选 **Web `</>`** → 填个昵称 → 注册应用。会给你一段 `firebaseConfig`，形如：

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "chess-room.firebaseapp.com",
     databaseURL: "https://chess-room-default-rtdb.firebaseio.com",
     projectId: "chess-room",
     storageBucket: "chess-room.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```

5. 把上面这段配置填进本仓库的 `src/firebase.config.ts`（替换掉里面的占位符），保存。

   > Firebase 的 Web 配置是**公开**的，这是 Firebase 的设计——安全靠数据库规则控制，不靠隐藏这段配置。所以把它提交到 GitHub 也没关系。

### 第二步：创建 GitHub 仓库并推送

1. 在 GitHub 新建一个仓库，**名字必须叫 `<你的用户名>.github.io`**（比如你的用户名是 `zhangsan`，仓库就叫 `zhangsan.github.io`）。这样它的 Pages 地址就是 `https://zhangsan.github.io/`。
   - 如果你已经有一个 `<用户名>.github.io` 仓库被占用了，也可以建普通仓库（比如 `chess-room`），那样地址会是 `https://zhangsan.github.io/chess-room/`，本项目的相对路径部署两种都支持。
2. 在本仓库目录下推送代码：

   ```bash
   git add -A
   git commit -m "双人联机国际象棋"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

### 第三步：开启 GitHub Pages（用 Actions 自动部署）

仓库已经带好 `.github/workflows/deploy.yml`，push 到 `main` 会自动构建并部署。只需在 GitHub 上开启一次：

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. 等第一次 push 触发的 Action 跑完（仓库 **Actions** 标签页能看到进度，绿色对勾即成功）。
3. 回到 **Settings → Pages**，顶部会显示你的网址，形如 `https://<你的用户名>.github.io/`。

把这个网址发给你老婆，两人同时打开就能开下了。先打开的人执白。

## 玩法说明

- **先手/后手**：先打开网页的人自动执白（先手），后打开的人执黑。棋盘会自动按你的视角摆放（白方在下方 / 黑方在下方）。
- **走子**：点一下自己的棋子选中（合法走法会用圆点提示，能吃子的格子画圆环），再点目标格子完成走子。点别的自己的棋子可以切换选中。
- **升变**：兵走到对方底线时弹出选择框，选 后/车/象/马。
- **再来一局**：对局结束后，白方点「再来一局」即可重置棋盘开新局（座位不变）。
- **换房间**：网址后面加 `?room=任意词` 可以开独立房间，比如 `https://xxx.github.io/?room=game2`。默认房间是 `love`。
- **断线**：关掉网页会自动释放座位，对方会看到「对方离开」。重新打开会自动恢复你原来的座位。

## 备注

- Firebase 免费额度很宽裕（100 个并发连接、1GB 存储），两个人用绰绰有余。
- 走子规则全部在客户端用 chess.js 校验，云端只做中转，不重复实现规则。
- 如果以后想加聊天、计时器、走棋回放等功能，在 `src/` 下扩展即可。
