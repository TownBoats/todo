# Todo 项目（练手版）PRD（MVP，修订版）

> 版本：v1.1（依据审查清单修正）
> 负责人：TownBoats(https://github.com/townboats)（开发/部署），神本（技术顾问）
> 目标：**用最小功能跑通前后端交互与上线流程**，边做边学。
> 技术栈：React+Vite(+Tailwind 可选) · TanStack Query · FastAPI · SQLModel(SQLite) · 自写最小 JWT(access+refresh 旋转) · 轮询增量 · Nginx+Docker(1Panel)

---

## 1. 产品愿景（第一性原理）

* **问题本质**：让多端的“同一用户”看到**同一份任务状态**。
* **必要条件**：

  1. **身份** → 登录/鉴权；
  2. **状态** → SQLite + 稳定数据模型；
  3. **通道** → 规范 API + 缓存/并发/错误处理（TanStack Query）。

---

## 2. 目标与非目标

### 2.1 MVP 目标

* 用户注册/登录/退出；
* 登录后可创建/查看/勾选完成/删除**自己的** todo；
* 多设备登录同一账号，通过**轮询**实现“≤10s”级同步（增量拉取，含删除传播）；
* 本地→服务器→域名+HTTPS 全流程打通。

### 2.2 非目标（MVP 不做）

* 实时 WebSocket、协作/分享、标签/搜索、提醒/推送；
* 第三方 OAuth、权限角色；
* Postgres/多副本/高可用；
* PWA、重型可观测性平台。

---

## 3. 用户故事（MVP）

1. 我可以注册并登录，看到**自己的**空任务列表；
2. 我可以输入标题创建任务；默认未完成，按创建时间倒序显示；
3. 我可以勾选/取消勾选、删除任务；
4. 我在手机和电脑同时登录同一账号时，**10s 内**看到另一端变化（含删除）；
5. 我刷新页面仍保持登录（refresh token 静默续期）。

**验收标准（AC）**

* 未登录访问 `/app` 被重定向到登录页；
* 登录后 10 秒内，另一端新增/勾选/删除的任务同步可见（轮询周期 ≤10s）；
* 创建/勾选/删除成功与失败均有明确反馈；
* 列表默认按 `created_at` 降序；支持 `limit` 并可扩展“加载更多”。

---

## 4. 信息架构与数据模型

### 4.1 表结构（SQLModel / SQLite）

```
users
- id (str, uuid) PK
- email (str, unique, required, stored as lowercase)
- password_hash (str, required)
- token_version (int, default 1)     // refresh 旋转/撤销用
- created_at (datetime, default now, UTC)

todos
- id (str, uuid) PK
- user_id (str, FK users.id, on delete cascade)
- title (str, required, max 200)
- done (bool, default false)
- deleted_at (datetime, nullable)    // 软删墓碑；非空表示已删除
- updated_at (datetime, auto update by server, UTC)
- created_at (datetime, default now, UTC)
```

**索引建议**

* `CREATE INDEX idx_todos_user_updated ON todos(user_id, updated_at DESC, id DESC);`
* `CREATE INDEX idx_todos_user_created ON todos(user_id, created_at DESC, id DESC);`
* 邮箱唯一性：保存前统一 `lower(email)`，并对列建唯一索引。

**SQLite 运行时约束（务必启用）**

* `PRAGMA foreign_keys=ON;`
* `PRAGMA journal_mode=WAL;`

**时间策略**

* 服务端统一使用 **UTC** 写入并返回 ISO8601（带 `Z`）。
* `updated_at` 由服务端在**每次写操作**更新（非 DB 自动）。

---

## 5. API 契约（`/api/v1`）

### 5.1 统一规则

* 认证：除登录/注册/刷新外，均需 `Authorization: Bearer <access_token>`
* 分页/增量：**稳定游标** `cursor`（基于 `(updated_at, id)` 的编码 token）+ `limit`（默认 50，最大 200）
* 返回的增量**按** `(updated_at ASC, id ASC)` 排序
* **软删传播**：增量中对已删除项返回墓碑 `{"id":"...","deleted":true,"updated_at":"..."}`
* **错误格式（统一）**：

  ```json
  {
    "error": { "code": "VALIDATION_FAILED", "message": "title is required", "details": {"field":"title"} },
    "requestId": "c79d..."
  }
  ```

  > 后端实现全局异常处理，422/400/401/403/404/409/429/500 均包一层并附 `X-Request-Id`。

### 5.2 端点与示例

#### Auth

* `POST /api/v1/auth/signup`
  请求：

  ```json
  { "email": "u@ex.com", "password": "123456" }
  ```

  响应：

  ```json
  { "user": {"id":"...","email":"u@ex.com"}, "access_token":"...","refresh_token":"..." }
  ```

* `POST /api/v1/auth/login` 同上结构

* `POST /api/v1/auth/refresh`（**滚动刷新**，失效旧的 refresh）

  ```json
  { "refresh_token":"..." }
  ```

  响应：

  ```json
  { "access_token":"...", "refresh_token":"..." }
  ```

  > 最简撤销方案：校验 `sub + token_version`；刷新时 `token_version++`，使旧 refresh 失效。

* `GET /api/v1/me` → 返回当前用户信息。

#### Todos

* **初次与增量拉取（稳定游标）**
  `GET /api/v1/todos?cursor=<token>&limit=50`

  * `cursor` 为空 → 仅返回**当前有效项**（不含墓碑），并给出 `next_cursor`；
  * `cursor` 非空 → 返回**自该游标之后**的变更（含墓碑）；
    响应示例：

  ```json
  {
    "items": [
      {"id":"...","title":"Buy milk","done":false,"created_at":"...","updated_at":"..."},
      {"id":"...","deleted":true,"updated_at":"..."}
    ],
    "next_cursor":"2025-10-20T00:00:05Z_a1b2c3...",
    "has_more": true
  }
  ```

* `POST /api/v1/todos`

  ```json
  { "title": "Buy milk" }
  ```

  响应：

  ```json
  { "id":"...", "title":"Buy milk", "done":false, "created_at":"...", "updated_at":"..." }
  ```

* `PATCH /api/v1/todos/{id}`（部分更新）

  ```json
  { "title": "Buy milk and eggs", "done": true }
  ```

  * 空体 → 400；未知字段 → 422/400。

* `DELETE /api/v1/todos/{id}` → 204

  * 语义：将 `deleted_at=now()` 并刷新 `updated_at`（软删）。

* `GET /api/v1/healthz` → 200 简要状态。

**状态码规范**：400/401/403/404/409/422/429/500。

---

## 6. 前端交互与状态（TanStack Query）

* **查询 key**：`["todos", { cursor }]`（初次为空）
* **轮询**：登录后 `refetchInterval = 10_000ms`；窗口失焦暂停，前台优先；失败指数退避
* **合并策略（重要）**：

  * 初次：以返回的**当前有效项**构建列表；
  * 增量：对 `items` 逐条 **upsert**（以 `id` 为键）；若 `deleted:true` → 从本地移除；
  * 渲染始终按 `created_at DESC` 排序，不受增量顺序影响。
* **乐观更新**：`create/toggle/delete` 均先改本地，失败回滚并提示
* **Token 管理（MVP）**：

  * `access_token` 内存为主（可用 `localStorage` 兜底）；
  * `refresh_token` 放 `localStorage`；刷新静默更新（**注意 XSS 风险**，后续可迁移 httpOnly Cookie）。
* **错误提示**：统一错误结构 → Toast/Inline 错误显示 `error.message`。

---

## 7. 安全与鉴权

* **密码**：`argon2id` 或 `bcrypt(>12)`（镜像若需编译依赖，见部署）
* **JWT**：`access(1h)` + `refresh(7d)`；**refresh 旋转** + `token_version` 失效旧 token
* **授权**：所有 `/todos*` 必须校验 `user_id == token.sub`
* **CORS（开发）**：允许 `http://localhost:5173`、`http://127.0.0.1:5173`；生产仅前端域名，且仅 HTTPS
* **安全头（生产）**：

  * `Strict-Transport-Security: max-age=31536000`
  * `X-Content-Type-Options: nosniff`
  * 可加最小化 `Content-Security-Policy`（限制外链源）

---

## 8. 并发与一致性

* **增量锚点**：稳定游标（`(updated_at, id)`）
* **冲突策略**：后写覆盖（MVP）
* **删除传播**：软删墓碑通过增量下发；初次拉取不包含墓碑
* **SQLite 并发**：启用 WAL；Uvicorn 单进程即可（后续再扩展）

---

## 9. 日志与可观测性（最小）

* Nginx 注入 `X-Request-Id`；后端日志输出 `level/time/requestId/userId/path/duration`
* 健康检查：`GET /healthz` 200
* 关键指标：拉取次数、变更条数、错误率

---

## 10. 部署设计

### 10.1 构建产物

* 前端：`vite build` → `dist/`（Nginx 静态托管）
* 后端：Docker 镜像（Uvicorn 8000）
* 数据：挂载卷 `/data/todo.db`（WAL 模式）

### 10.2 Nginx（同域反代，**保留 `/api` 前缀**）

站点：`todo.yourdomain.com`
静态根：`/var/www/todo/dist`
反代：`/api/` → `http://127.0.0.1:8000`（**proxy_pass 无尾斜杠**）
HTTPS：Let’s Encrypt（1Panel 可一键）

```nginx
server {
  listen 80;
  server_name todo.example.com;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2;
  server_name todo.example.com;

  ssl_certificate     /etc/letsencrypt/live/todo.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/todo.example.com/privkey.pem;

  root /var/www/todo/dist;
  index index.html;

  # SPA 回退
  location / { try_files $uri /index.html; }

  # API 反代 —— 保留 /api 前缀
  location /api/ {
    proxy_pass http://127.0.0.1:8000;  # 无尾斜杠
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
  }

  # 安全与缓存（可按需调整）
  add_header Strict-Transport-Security "max-age=31536000" always;
  location ~* \.(js|css|png|jpg|svg|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
  location = /index.html {
    add_header Cache-Control "no-store";
  }
}
```

**登录限流（示例）**

```nginx
limit_req_zone $binary_remote_addr zone=login_zone:10m rate=3r/m;

location = /api/v1/auth/login {
  limit_req zone=login_zone burst=3 nodelay;
  proxy_pass http://127.0.0.1:8000;
  proxy_set_header X-Request-Id $request_id;
}
```

### 10.3 Docker（后端镜像）

`backend/Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
ENV DB_URL=sqlite:////data/todo.db
RUN mkdir -p /data

EXPOSE 8000
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]
```

**运行（镜像名示例：todo-backend）**

* 1Panel：端口 `8000:8000`；卷 `/srv/todo/data:/data`
* 命令行：

```bash
docker run -d --name todo-backend \
  -e DB_URL=sqlite:////data/todo.db \
  -v /srv/todo/data:/data \
  -p 8000:8000 --restart=always todo-backend:latest
```

> 若密码库需编译依赖，可在 Dockerfile 中追加：
>
> ```
> RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*
> ```

### 10.4 systemd（可选）

```
/etc/systemd/system/todo-backend.service
[Unit]
Description=Todo Backend Container
After=docker.service
Requires=docker.service

[Service]
Restart=always
ExecStart=/usr/bin/docker run --rm --name todo-backend \
  -e DB_URL=sqlite:////data/todo.db \
  -v /srv/todo/data:/data -p 8000:8000 todo-backend:latest
ExecStop=/usr/bin/docker stop todo-backend

[Install]
WantedBy=multi-user.target
```

---

## 11. 环境与配置

* 开发：WSL2（Ubuntu）；DB 本地文件；`vite` 热更；后端 `uvicorn --reload`；允许 CORS 到 `5173`
* 生产：Nginx + 后端容器 + 数据卷；`.env` 用 1Panel/环境变量注入
* 时区：容器内建议 `UTC`，前端显示再本地化（或明确使用 `datetime.now(timezone.utc)`）

---

## 12. 质量与性能基线

* 首屏渲染 < 1s（内网）
* 轮询每次返回 ≤50 条（可提到 200）
* 标题 ≤200；请求超时 10s
* 登录限流：3 次/分钟/IP（Nginx）

---

## 13. 风险与对策

* **XSS 导致 token 泄露** → 控制依赖/输入，后续迁移 httpOnly Cookie + CSP
* **SQLite 并发写入** → 规模小风险低；开启 WAL；必要时限制多 worker
* **轮询带宽** → 稳定游标 + `limit`；仅增量
* **时区/时间戳误差** → 全部使用 UTC 写入与返回
* **令牌撤销** → `token_version` + 刷新旋转；检测重放可强制登出

---

## 14. 里程碑（执行清单）

1. 后端骨架（FastAPI+SQLModel+JWT+SQLite+迁移脚本；WAL/外键/UTC/错误封装）
2. API 完成并本地可用（`/auth`、`/todos` 稳定游标 + 软删墓碑）
3. 前端骨架（Vite+React+TanStack Query+路由）
4. 完成登录与 Todo CRUD（含乐观更新、统一错误提示）
5. 加轮询增量同步（`cursor+limit`；10s 周期；前台优先、失焦暂停）
6. Docker 化后端 → 1Panel 启动容器（持久卷 `/data`）
7. Nginx 配静态站点与反代（无尾 `/api`）、HTTPS、HSTS、登录限流
8. 验收（多端登录≤10s 同步，含删除；过期自动刷新；离线回退）

---

## 15. 字段校验与契约（关键约束）

* `email`：RFC 基础校验；**存储为小写**；唯一
* `password`：≥6；仅存哈希
* `title`：1–200 字符
* `cursor`：服务端生成与解析；客户端**不解释内部结构**
* `limit`：默认 50；最大 200
* `datetime`：ISO8601（UTC，结尾 `Z`）

---

### 附：后端实现要点（提示性，非完整代码）

* Engine：

  * `connect_args={"check_same_thread": False}`（SQLite）
  * `@event.listens_for(Engine,"connect")` 启动 `PRAGMA foreign_keys=ON;` 与 `PRAGMA journal_mode=WAL;`
* 时间：`utcnow = lambda: datetime.now(timezone.utc)`；写操作统一更新 `updated_at`
* 游标：`ORDER BY updated_at ASC, id ASC LIMIT :limit`；将 `(updated_at,id)` 编码为 `next_cursor`
* 全局异常：捕获 `HTTPException`/`RequestValidationError` 输出统一错误结构并附 `requestId`

---

此修订版已落实：**删除传播（软删墓碑）**、**稳定增量游标**、**Nginx 反代与前缀一致**、**SQLite 绝对路径与 WAL/外键**、**统一错误格式**、**UTC 时间**、**登录限流**、**开发 CORS** 等关键修正，可直接用于执行与验收。
