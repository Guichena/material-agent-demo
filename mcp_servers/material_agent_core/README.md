# Material Agent Core MCP Server

本 demo 使用的 `material-agent-core` MCP server。

它只暴露两个工具：

- `mattergen_generate`
- `mattersim_evaluate`

真正执行逻辑复用外部 `material-agent` 仓库中的 adapter。

## 关键环境变量

```bash
MATERIAL_AGENT_REPO_ROOT=/abs/path/to/material-agent
MATTERGEN_GENERATE_BIN=/abs/path/to/mattergen-generate
MATTERSIM_PYTHON=/abs/path/to/python
MATTERSIM_LOAD_PATH=/abs/path/to/mattersim-v1.0.0-1M.pth
MATTERSIM_DEVICE=cuda
MCP_HOST=127.0.0.1
MCP_PORT=8765
```
