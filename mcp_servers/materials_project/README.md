# Materials Project MCP Server

本 demo 使用的 `materials-project` MCP server。

它只保留 demo 主链路需要的几个工具：

- `search_materials_by_formula`
- `select_material_by_id`
- `get_structure_data`
- `create_structure_from_cif`

## 关键环境变量

```bash
MP_API_KEY=...
MCP_HOST=127.0.0.1
MCP_PORT=8766
MATERIALS_PROJECT_WORKDIR=/abs/path/to/workdir/materials-project
```
