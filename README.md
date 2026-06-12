# 跑团平台（TRPG Platform）

在线 TRPG 跑团平台：KP 主持、玩家实时跑团。实现 PRD v1.1 全部模块。

- **技术栈**：React 18 + Vite（前端） / Node.js + Express + Socket.IO（后端） / PostgreSQL（数据库，Docker 运行）
- **后端**：http://localhost:4100 　**前端**：http://localhost:5173
- **超管初始账号**：`admin` / `admin888`（首次迁移时创建，可在 `server/.env` 修改）

> 注：后端用 4100 而非 4000，因为本机 4000 端口已被其他服务占用。

---

## 一键启动（Windows）

双击 **`start.bat`**，它会依次：起 PostgreSQL 容器 → 等库就绪 → 装依赖（首次） → 跑迁移 → 同时启动前后端。

> 前置：已安装并**启动** Docker Desktop（脚本用 docker 跑数据库）。

启动后打开 http://localhost:5173 ，用 `admin / admin888` 登录。

---

## 手动启动

```bash
# 1. 起数据库（需 Docker Desktop 运行中）
npm run db:up

# 2. 安装依赖（首次）
npm run install:all

# 3. 建表 + 创建超管 + 内置模板
npm run db:migrate

# 4. 同时启动前后端
npm run dev
```

常用脚本：`npm run server` / `npm run client` 单独启动；`npm run db:down` 停库；`npm run build` 构建前端。

---

## 使用流程

1. **超管**登录后进入「超管后台」：创建玩家账号、管理人物卡模板（已内置 COC 七版 / DND 5E）。
2. 任意账号在**大厅**「开团」，成为该团 KP；其他玩家「申请加入」，KP 在通知后审批。
3. 进入团：
   - **KP 控制台**：开始/暂停、禁言、结束（不可逆，二次确认）；场景库切换、人物/焦点悬浮、NPC 管理与「以 NPC 发言」（触发立绘演出）、玩家面板（看/改人物卡、看背包、发物品）、线索分发、骰点（含暗骰）。
   - **玩家界面**：场景图 + 悬浮层 + 立绘演出；下方对话区（角色发言/玩家行动模式切换、历史导出 TXT/HTML）；左侧工具栏（角色卡、背包拖拽、线索、人物图鉴+私有备注、骰点）。

---

## 端到端自测

后端启动后，运行核心闭环冒烟测试（登录→建团→加入→审批→实时对话/骰点/NPC立绘/场景切换/线索/物品/结束）：

```bash
node e2e-test.mjs
```

---

## 目录结构

```
TRPG/
├─ start.bat              一键启动（纯 ASCII）
├─ docker-compose.yml     PostgreSQL 容器（端口 5500->5432）
├─ e2e-test.mjs           端到端冒烟测试
├─ server/                后端
│  ├─ .env                配置（端口/JWT/数据库/超管）
│  └─ src/
│     ├─ index.js         Express + Socket.IO 启动
│     ├─ schema.sql       数据库 DDL
│     ├─ migrate.js       迁移 + 种子
│     ├─ db.js / auth.js / middleware.js / realtime.js / dice.js / messages.js
│     ├─ routes/          auth · admin · groups · game · upload
│     └─ socket/          实时事件处理
└─ client/                前端（React + Vite）
   └─ src/
      ├─ pages/           Login · Lobby · AdminConsole · GameRoom
      └─ game/            useGameRoom · Stage · Dialogue · PerformanceLayer · PlayerView · KPConsole · 各面板
```

---

## 数据库连接

`server/.env` 中 `DATABASE_URL=postgres://trpg:trpg_pass@localhost:5500/trpg`
（容器内 5432 映射到本机 **5500**，与本机其他 PG 实例隔离。）

## 部署到阿里云

按既有约定：本地 `npm run build` 产出 `client/dist`，将 `server` + `client/dist` 打包 zip 上传，服务器上 `npm install --omit=dev` 后 `node server/src/index.js`（建议配 pm2 + Nginx 反代静态资源与 `/api`、`/socket.io`、`/uploads`）。生产环境务必修改 `JWT_SECRET` 与数据库密码。
