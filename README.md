# Materials Discovery Workspace

这是一个可独立部署的材料发现工作台示例仓库。

项目提供一套可运行的端到端链路：

- 前端只输入一段自然语言 `prompt`
- 后端自动解析 `formula / num_samples / relax`
- 历史任务默认直接进入结果页
- 新任务提交后自动切到结果视图并持续轮询
- 页面保留参考检索、候选生成、MatterSim 评估和产物下载能力

核心链路：

`Frontend -> FastAPI -> LangGraph-style workflow -> LLM Router/Fallback Router -> MCP -> Materials Project / MatterGen / MatterSim`

## 快速开始

按下面步骤即可完成最小安装：

```bash
git clone https://github.com/Guichena/material-agent-demo.git
cd material-agent-demo
conda env create -f environment.yml
conda activate materials-demo-teaching
bash scripts/bootstrap.sh
cp .env.example .env
```

然后修改 `.env` 里这几个核心字段：

```bash
MP_API_KEY=your_mp_api_key
DEMO_BACKEND_PYTHON=/abs/path/to/conda/envs/materials-demo-teaching/bin/python
MATERIAL_AGENT_REPO_ROOT=/abs/path/to/material-agent
MATTERGEN_GENERATE_BIN=/abs/path/to/mattergen/bin/mattergen-generate
MATTERSIM_PYTHON=/abs/path/to/mattersim/bin/python
MATTERSIM_LOAD_PATH=/abs/path/to/mattersim-v1.0.0-1M.pth
```

启动全部服务：

```bash
bash scripts/start_all.sh
```

打开：

```text
http://127.0.0.1:3000
```

如果前端需要访问非默认后端地址，启动前端时显式指定：

```bash
cd frontend-next
NEXT_PUBLIC_API_BASE_URL=http://your-backend-host:18018 npm run dev -- --hostname 127.0.0.1 --port 3000
```

## 你需要准备什么

运行本项目前，需要准备以下三类资源：

- 本项目自己的 conda 环境
- MatterGen 运行能力：`MATTERGEN_GENERATE_BIN`
- MatterSim 运行能力：`MATTERSIM_PYTHON + MATTERSIM_LOAD_PATH`

此外还需要一个有效的 `MP_API_KEY`，用于 Materials Project 检索。

## 项目定位

这个仓库主要用于两类场景：

1. 作为材料发现工作台的参考实现。
2. 作为讲解前端、工作流、MCP 和模型环境协作方式的教学仓库。

推荐使用方式是：克隆仓库、按文档配置环境、再根据需要继续二次开发。

需要特别说明的是：

- 仓库已经包含前端、后端、MCP server 封装和启动脚本
- 默认推荐维护 `1` 套本项目 Python 环境：
- 本项目自己的 conda 环境，同时承载 FastAPI、`materials-project` MCP、`material-agent-core` MCP
- 外部 `MatterGen` 环境
- 外部 `MatterSim` 环境

当前交互设计有以下特点：

- 去掉“演示模式”入口
- 去掉显式 `formula / num_samples / relax` 输入框
- 历史任务不再只是列表，而是默认承载结果回看入口
- 页面结构改为“左侧历史 + 右侧主工作区”的产品型布局

## 目录结构

```text
material-agent-demo/
├── app/                                  # FastAPI + workflow + task store
├── frontend-next/                        # Next.js 工作台前端
├── mcp_servers/
│   ├── material_agent_core/              # MatterGen / MatterSim MCP server
│   └── materials_project/                # Materials Project MCP server
├── docs/
│   ├── 配置与模型准备.md
│   └── 产品架构与页面流转.md
├── scripts/                              # 启动脚本
├── workdir/                              # 运行期结构缓存
├── .env.example
├── pyproject.toml
└── README.md
```

## 前端体验

前端位于 `frontend-next/`，通过 `/api/tasks` 对接后端 FastAPI 服务。

默认规则：

- 如果前端运行在 `3000`，默认请求 `http://127.0.0.1:18018`
- 如果前后端不在同一地址，显式设置 `NEXT_PUBLIC_API_BASE_URL`

主要界面分为三部分：

1. 左侧历史任务时间线
   - 按“今天 / 昨天 / 最近 7 天 / 更早”分组
   - 已有任务默认可直接点开结果页
2. 中间主工作区
   - 无历史任务时，显示 prompt 输入页
   - 有历史任务时，默认进入最近任务结果页
3. 结果视图
   - 显示工作流进度、消息流、路由决策、参考材料、候选结果、trace 与 CIF 下载

## 输入与任务行为

前端提交参数现在只有：

- `prompt`
- `reuse_existing`

后端会做一次规范化：

- 如果配置了 `LLM_ROUTER_*`，优先让 LLM 从 prompt 中解析 `formula / num_samples / relax`
- 如果 LLM 未配置、调用失败或返回不完整，再回退到本地规则兜底
- `formula`：优先从显式字段取值，否则从 prompt 中推断
- `num_samples`：优先从显式字段取值，否则从 prompt 中推断；提取不到时默认 `3`
- `relax`：优先从显式字段取值，否则根据 prompt 中是否出现“弛豫 / relax / 不做弛豫”等提示推断

任务系统行为：

- 新任务创建后立即返回任务卡片
- 页面自动切到结果视图
- 后端后台执行工作流
- 前端轮询 `/api/tasks` 和 `/api/tasks/{id}`
- 历史任务会写入 `data/tasks.json`
- 服务重启后历史任务会自动恢复
- 如果 `reuse_existing=true` 且规范化后的输入一致，会复用已有 `running/completed` 任务

## 后端结构

关键文件：

- [app/main.py](app/main.py)
- [app/workflow.py](app/workflow.py)
- [app/task_store.py](app/task_store.py)
- [app/models.py](app/models.py)

工作流主节点：

1. `parse_input`
2. `decide_next_step`
3. `lookup_reference_materials`
4. `generate_structures`
5. `evaluate_structures`
6. `finalize`

路由层支持两种模式：

- 配置 `LLM_ROUTER_*` 后使用 OpenAI 兼容模型做两件事：
  - prompt 参数解析
  - `decide_next_step` 的 JSON 路由决策
- 未配置时回退到本地规则路由

## 文档入口

建议先看这两份文档：

1. [docs/配置与模型准备.md](docs/配置与模型准备.md)
2. [docs/产品架构与页面流转.md](docs/产品架构与页面流转.md)

前者讲环境和模型，后者讲产品结构和代码职责。

## 安装前准备

推荐环境：

- Conda
- 一个可用的 `MP_API_KEY`
- 本项目自己的 conda 环境
- 一个可运行的 MatterGen 环境
- 一个可运行的 MatterSim 环境

如果要跑通完整链路，还需要准备：

- `material-agent` 仓库或等价运行资源
- `mattergen-generate` 可执行文件
- MatterSim 的 `.pth` checkpoint

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/Guichena/material-agent-demo.git
cd material-agent-demo
```

### 2. 创建 conda 环境

执行：

```bash
conda env create -f environment.yml
conda activate materials-demo-teaching
```

这会创建名为 `materials-demo-teaching` 的 conda 环境，并安装：

- 后端依赖
- `materials-project` MCP server
- `material-agent-core` MCP server
- Node.js / npm

创建完成后，主 Python 通常是：

```bash
$(conda info --base)/envs/materials-demo-teaching/bin/python
```

### 3. 初始化当前 conda 环境

激活 conda 环境后，执行：

```bash
bash scripts/bootstrap.sh
```

该脚本会：

- 把后端依赖同步安装到当前已激活的 conda 环境
- 把两个 MCP server 同步安装到当前已激活的 conda 环境
- 安装 `frontend-next` 的 npm 依赖
- 如果 `.env` 不存在，就从 `.env.example` 自动复制一份

执行完成后，继续修改 `.env` 中的路径即可。

### 4. 只安装前端依赖

```bash
cd frontend-next
npm install
cd ..
```

### 5. 复制配置文件

```bash
cp .env.example .env
```

### 6. 修改 `.env`

第一次配置时，优先修改这些字段：

```bash
MP_API_KEY=your_mp_api_key

DEMO_BACKEND_PYTHON=/abs/path/to/conda/envs/materials-demo-teaching/bin/python

MATERIAL_AGENT_REPO_ROOT=/abs/path/to/material-agent
MATTERGEN_GENERATE_BIN=/abs/path/to/mattergen/bin/mattergen-generate
MATTERSIM_PYTHON=/abs/path/to/mattersim/bin/python
MATTERSIM_LOAD_PATH=/abs/path/to/mattersim-v1.0.0-1M.pth
```

## 外部依赖来源与建议路径

完整链路需要 3 类外部资源：

1. `MP_API_KEY`
2. MatterGen 运行能力
3. MatterSim 运行能力与 checkpoint

推荐按下面这张表配置：

| 资源 | 官方来源 | 建议本地路径 | `.env` 字段 |
| --- | --- | --- | --- |
| Materials Project API key | Materials Project 文档与用户主页 | 不落盘，直接填字符串 | `MP_API_KEY` |
| `material-agent` 仓库 | 你的外部 `material-agent` 工作目录 | `/abs/path/to/material-agent` | `MATERIAL_AGENT_REPO_ROOT` |
| MatterGen 仓库/环境 | GitHub: `microsoft/mattergen`；HF: `microsoft/mattergen` | `/abs/path/to/material-agent/agent_models/mattergen` 或你自己的 MatterGen 目录 | `MATTERGEN_GENERATE_BIN` 指向其中环境里的 `mattergen-generate` |
| MatterSim 仓库/环境 | GitHub: `microsoft/mattersim` | `/abs/path/to/material-agent/agent_models/mattersim` 或你自己的 MatterSim 目录 | `MATTERSIM_PYTHON` 指向该环境的 `python` |
| MatterSim checkpoint | MatterSim 仓库 `pretrained_models/` | `/abs/path/to/material-agent/agent_models/mattersim/pretrained_models/mattersim-v1.0.0-1M.pth` | `MATTERSIM_LOAD_PATH` |

常见填写示例：

```bash
MP_API_KEY=your_real_mp_api_key
DEMO_BACKEND_PYTHON=/abs/path/to/conda/envs/materials-demo-teaching/bin/python
MATERIAL_AGENT_REPO_ROOT=/abs/path/to/material-agent
MATTERGEN_GENERATE_BIN=/abs/path/to/mattergen-env/bin/mattergen-generate
MATTERSIM_PYTHON=/abs/path/to/mattersim-env/bin/python
MATTERSIM_LOAD_PATH=/abs/path/to/material-agent/agent_models/mattersim/pretrained_models/mattersim-v1.0.0-1M.pth
```

## 运行系统

准备好 `.env` 后，启动全部服务：

```bash
bash scripts/start_all.sh
```

或分别启动：

```bash
bash scripts/start_materials_project.sh
bash scripts/start_material_agent_core.sh
bash scripts/start_demo_backend.sh
bash scripts/start_next_frontend.sh
```

如果前端需要连到非默认后端地址，改用：

```bash
cd frontend-next
NEXT_PUBLIC_API_BASE_URL=http://your-backend-host:18018 npm run dev -- --hostname 127.0.0.1 --port 3000
```

访问地址：

```text
http://127.0.0.1:3000
```

如果你访问了 `http://127.0.0.1:18018/`，后端会自动跳转到 `3000`。

## 路径配置方法

核心原则：

- 全部使用绝对路径
- 不要直接照抄示例路径
- 先用命令找到实际路径，再填入 `.env`

常用查找方法：

### 1. 找到当前 demo 目录

```bash
pwd
```

如果当前位于仓库根目录，输出结果通常类似于：

```bash
/abs/path/to/material-agent-demo
```

那么 `.env` 里可以写：

```bash
DEMO_BACKEND_PYTHON=/abs/path/to/conda/envs/materials-demo-teaching/bin/python
MATERIALS_PROJECT_WORKDIR=/abs/path/to/material-agent-demo/workdir/materials-project
```

### 2. 找到某个 Python 环境

先激活对应环境，然后执行：

```bash
which python
```

例如：

```bash
conda activate mattersim
which python
```

把输出填到：

```bash
MATTERSIM_PYTHON=/that/path/python
```

默认情况下，`materials-project` 和 `material-agent-core` 会自动继承：

```bash
DEMO_BACKEND_PYTHON=/abs/path/to/conda/envs/materials-demo-teaching/bin/python
```

只有你确实要把 MCP 单独拆到别的 Python，才需要额外配置：

```bash
conda activate your-custom-mcp-env
which python
```

把输出填到：

```bash
MATERIALS_PROJECT_MCP_PYTHON=/that/path/python
MATERIAL_AGENT_CORE_MCP_PYTHON=/that/path/python
```

一般情况下无需填写这两个变量。

### 3. 找到 `mattergen-generate`

激活 MatterGen 环境后执行：

```bash
which mattergen-generate
```

把输出填到：

```bash
MATTERGEN_GENERATE_BIN=/that/path/mattergen-generate
```

### 4. 找到 MatterSim checkpoint

先在你的模型目录里搜索：

```bash
find /your/model/root -name 'mattersim-v1.0.0-1M.pth'
```

把输出填到：

```bash
MATTERSIM_LOAD_PATH=/that/path/mattersim-v1.0.0-1M.pth
```

### 5. 找到 `material-agent` 仓库

如果已经准备好了 `material-agent` 仓库，进入其根目录执行：

```bash
pwd
```

把结果填到：

```bash
MATERIAL_AGENT_REPO_ROOT=/that/path/material-agent
```

## 最小验收

至少应满足：

1. `GET /api/health` 正常
2. 页面可创建 prompt-only 任务
3. 历史任务刷新后仍可恢复
4. 结果页能展示参考材料 / 候选结果 / trace

常用检查：

```bash
curl http://127.0.0.1:18018/api/health
python -m compileall material-agent-demo/app
cd frontend-next && npm run typecheck
```

说明：

- `materials-project` 和 `material-agent-core` 的真正验收不是直接 `GET /mcp`
- 真正调用需要走 MCP `initialize` + `tools/call`

## 常见问题

### 1. Materials Project 工具一调用就超时或握手失败

优先检查代理变量。默认配置通过 `MATERIALS_PROJECT_CLEAR_PROXY=true` 尽量规避这类问题，但如果你自己手动启动服务，仍要确认 `HTTP_PROXY / HTTPS_PROXY` 没有污染到调用链路。

### 2. MatterGen 或 MatterSim 无法启动

先核对：

- `MATERIAL_AGENT_REPO_ROOT`
- `MATTERGEN_GENERATE_BIN`
- `MATTERSIM_PYTHON`
- `MATTERSIM_LOAD_PATH`

建议直接先在 shell 里验证：

```bash
ls -l "$MATERIAL_AGENT_REPO_ROOT"
ls -l "$MATTERGEN_GENERATE_BIN"
ls -l "$MATTERSIM_PYTHON"
ls -l "$MATTERSIM_LOAD_PATH"
```

### 3. prompt 能提交，但结果页没有候选结构

这通常意味着：

- prompt 被路由成“仅检索”
- MatterGen 生成失败
- 评估节点因前置结果为空被跳过

优先看结果页里的：

- 路由决策
- 系统消息
- Trace

## 可继续扩展的方向

- 增加更强的 prompt 解析策略
- 增加结构化报告导出
- 接入与 `material-agent` 更接近的完整结果页
- 继续完善 `frontend-next/` 的工作台能力
