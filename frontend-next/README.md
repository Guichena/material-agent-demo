# `frontend-next`

这是 `materials-demo-teaching` 项目当前使用的 `Next.js` 前端。

它的职责很简单：

- 提供 `prompt-only` 输入入口
- 展示历史任务列表
- 展示任务结果页、流程图、参考材料和候选结构
- 通过 HTTP 访问 `materials-demo-teaching` 的 FastAPI 后端

默认后端真实地址：

```text
http://127.0.0.1:18018
```

默认前端地址：

```text
http://127.0.0.1:3000
```

## 1. 安装

先进入前端目录：

```bash
cd materials-demo-teaching/frontend-next
```

安装依赖：

```bash
npm install
```

建议环境：

- Node.js `18+`
- npm `9+`

检查版本：

```bash
node -v
npm -v
```

## 2. 后端如何连接

前端 API 适配代码在：

- [lib/api.ts](/var/lib/docker/my_workspace/hwj/materials-demo-teaching/frontend-next/lib/api.ts)

默认规则是：

- 如果前端运行在 `3000`，默认请求 `http://当前主机:18018`
- 如果前端直接和后端同端口运行，使用当前页面 origin
- 如果前后端不在同一地址，显式设置 `NEXT_PUBLIC_API_BASE_URL`

例如：

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18018
```

## 3. 本地启动

先启动后端：

```bash
cd materials-demo-teaching
bash scripts/start_demo_backend.sh
```

再启动前端：

```bash
cd materials-demo-teaching
bash scripts/start_next_frontend.sh
```

或者直接在前端目录启动：

```bash
cd materials-demo-teaching/frontend-next
npm run dev -- --hostname 127.0.0.1 --port 3000
```

如果后端不在本机 `18018`，改成：

```bash
cd materials-demo-teaching/frontend-next
NEXT_PUBLIC_API_BASE_URL=http://your-backend-host:18018 npm run dev -- --hostname 127.0.0.1 --port 3000
```

浏览器访问：

```text
http://127.0.0.1:3000
```

## 4. 常用命令

类型检查：

```bash
cd materials-demo-teaching/frontend-next
npm run typecheck
```

生产构建：

```bash
cd materials-demo-teaching/frontend-next
npm run build
```

开发模式启动：

```bash
cd materials-demo-teaching/frontend-next
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## 5. 联调自检

确认后端健康：

```bash
curl http://127.0.0.1:18018/api/health
```

确认前端首页可访问：

```bash
curl -I http://127.0.0.1:3000
```

确认任务列表接口正常：

```bash
curl http://127.0.0.1:18018/api/tasks
```

## 6. 目录说明

- `app/`
  - 页面入口与路由
- `components/`
  - 页面组件、结果组件、UI 组件
- `lib/`
  - API 适配、类型定义、视图模型转换

## 7. 注意事项

- 这个前端已经改造成对接 `materials-demo-teaching` 的 `/api/tasks` 接口，不再使用原 `material-agent` 的 `/runs` API。
- 如果前端页面能打开，但没有数据，优先检查 `18018` 后端是否启动。
- 如果后端跑在别的机器或端口，直接显式指定 `NEXT_PUBLIC_API_BASE_URL`。
