from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "workdir" / "test-results" / "mcp-e2e-results.json"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import SETTINGS
from app.mcp_client import McpHttpClient


def _text_items(content: list[dict[str, Any]]) -> list[str]:
    return [
        item.get("text", "")
        for item in content
        if isinstance(item, dict) and item.get("type") == "text"
    ]


async def main() -> None:
    materials = McpHttpClient(SETTINGS.materials_project_url)
    core = McpHttpClient(SETTINGS.material_agent_core_url)

    results: dict[str, Any] = {
        "config": {
            "materials_project_url": SETTINGS.materials_project_url,
            "material_agent_core_url": SETTINGS.material_agent_core_url,
        },
        "materials_project": {},
        "material_agent_core": {},
    }

    search = await materials.call_tool(
        "search_materials_by_formula",
        {"chemical_formula": "SiO2"},
    )
    search_texts = _text_items(search.get("content", []))
    results["materials_project"]["search_materials_by_formula"] = {
        "isError": search.get("isError"),
        "count": len(search_texts),
        "preview": search_texts[:3],
    }

    selected_material_id = None
    structure_uri = None
    if search_texts:
        first = search_texts[0]
        for token in first.replace(",", " ").split():
            if token.lower().startswith("mp-"):
                selected_material_id = token
                break

    if selected_material_id:
        select_result = await materials.call_tool(
            "select_material_by_id",
            {"material_id": selected_material_id},
        )
        select_texts = _text_items(select_result.get("content", []))
        for line in select_texts:
            if "structure://" in line:
                structure_uri = line.split("structure uri:", 1)[-1].strip()
                break
        results["materials_project"]["select_material_by_id"] = {
            "isError": select_result.get("isError"),
            "material_id": selected_material_id,
            "preview": select_texts[:3],
        }

    if structure_uri:
        structure_result = await materials.call_tool(
            "get_structure_data",
            {"structure_uri": structure_uri, "format": "cif"},
        )
        structure_texts = _text_items(structure_result.get("content", []))
        cif_text = structure_texts[0] if structure_texts else ""
        results["materials_project"]["get_structure_data"] = {
            "isError": structure_result.get("isError"),
            "structure_uri": structure_uri,
            "cif_length": len(cif_text),
            "cif_head": cif_text[:240],
        }

    gen_result = await core.call_tool(
        "mattergen_generate",
        {
            "composition": "SiO2",
            "num_samples": 1,
            "model_name": "chemical_system",
        },
    )
    gen_structured = gen_result.get("structuredContent") or {}
    gen_payload = gen_structured.get("result", gen_structured)
    cif_paths = list(gen_payload.get("cif_paths") or [])
    results["material_agent_core"]["mattergen_generate"] = {
        "isError": gen_result.get("isError"),
        "structured": gen_structured,
    }

    if cif_paths:
        eval_result = await core.call_tool(
            "mattersim_evaluate",
            {
                "cif_paths": cif_paths,
                "property_name": "energy_per_atom",
                "device": "cuda",
                "relax": False,
            },
        )
        results["material_agent_core"]["mattersim_evaluate"] = {
            "isError": eval_result.get("isError"),
            "structured": eval_result.get("structuredContent") or {},
        }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(str(OUTPUT))


if __name__ == "__main__":
    asyncio.run(main())
