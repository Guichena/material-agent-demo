from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from typing import Annotated, Any, Optional

from mcp.server.fastmcp import FastMCP
from pydantic import Field


def _find_repo_root() -> Path:
    repo_root = os.getenv("MATERIAL_AGENT_REPO_ROOT", "").strip()
    if not repo_root:
        raise RuntimeError("MATERIAL_AGENT_REPO_ROOT is required.")
    candidate = Path(repo_root).expanduser().resolve()
    if not (candidate / "material_agent").is_dir():
        raise RuntimeError(
            "MATERIAL_AGENT_REPO_ROOT does not contain the `material_agent` package: "
            f"{candidate}"
        )
    return candidate


REPO_ROOT = _find_repo_root()
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from material_agent.adapters import MatterGenGenerator, MatterSimEvaluator  # noqa: E402


HTTP_HOST = os.getenv("MCP_HOST", "127.0.0.1")
HTTP_PORT = int(os.getenv("MCP_PORT", "8765"))

mcp = FastMCP(
    name="material-agent-core",
    host=HTTP_HOST,
    port=HTTP_PORT,
    stateless_http=True,
)


def _default_output_dir(tool_name: str) -> str:
    output_dir = REPO_ROOT / "runs" / "teaching_mcp" / tool_name / uuid.uuid4().hex[:8]
    output_dir.mkdir(parents=True, exist_ok=True)
    return str(output_dir)


@mcp.tool(name="mattergen_generate")
def mattergen_generate(
    composition: Annotated[Optional[str], Field(default=None)] = None,
    num_samples: Annotated[int, Field(default=8, ge=1)] = 8,
    output_dir: Annotated[Optional[str], Field(default=None)] = None,
    batch_size_per_z: Annotated[int, Field(default=8, ge=1)] = 8,
    model_name: Annotated[str, Field(default="chemical_system")] = "chemical_system",
) -> dict[str, Any]:
    generator = MatterGenGenerator(
        generate_bin=os.getenv("MATTERGEN_GENERATE_BIN", ""),
        model_name=model_name,
    )
    actual_output_dir = output_dir or _default_output_dir("mattergen")
    cif_paths = generator.generate(
        composition=composition,
        num_samples=num_samples,
        batch_size_per_Z=batch_size_per_z,
        output_dir=actual_output_dir,
    )
    return {
        "ok": True,
        "tool": "mattergen_generate",
        "output_dir": actual_output_dir,
        "num_samples_generated": len(cif_paths),
        "cif_paths": cif_paths,
    }


@mcp.tool(name="mattersim_evaluate")
def mattersim_evaluate(
    cif_paths: Annotated[list[str], Field(min_length=1)],
    property_name: Annotated[str, Field(default="energy_per_atom")] = "energy_per_atom",
    device: Annotated[str, Field(default="cuda")] = "cuda",
    relax: Annotated[bool, Field(default=False)] = False,
    return_force_summary: Annotated[bool, Field(default=False)] = False,
    return_stress: Annotated[bool, Field(default=False)] = False,
    output_dir: Annotated[Optional[str], Field(default=None)] = None,
) -> dict[str, Any]:
    evaluator = MatterSimEvaluator(
        python_executable=os.getenv("MATTERSIM_PYTHON", ""),
        load_path=os.getenv("MATTERSIM_LOAD_PATH", ""),
        device=device or os.getenv("MATTERSIM_DEVICE", "cuda"),
        relax=relax,
        return_force_summary=return_force_summary,
        return_stress=return_stress,
        write_relaxed_cifs=relax,
    )
    actual_output_dir = output_dir or _default_output_dir("mattersim")
    results = evaluator.evaluate(
        cif_paths=cif_paths,
        property_name=property_name,
        output_dir=actual_output_dir,
    )
    return {
        "ok": True,
        "tool": "mattersim_evaluate",
        "output_dir": actual_output_dir,
        "num_results": len(results),
        "results": results,
    }


def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "streamable-http").strip() or "streamable-http"
    mcp.run(transport=transport)


if __name__ == "__main__":
    main()
