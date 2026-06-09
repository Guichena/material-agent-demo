from __future__ import annotations

import base64
import io
import os
from typing import Annotated, Literal

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mcp.server.fastmcp import FastMCP
from mcp.types import ImageContent, TextContent
from pymatgen.core import Structure

from .rester import get_mp_rester
from .structure_store import get_or_create_from_material_id, load_structure, save_structure


HTTP_HOST = os.getenv("MCP_HOST", "127.0.0.1")
HTTP_PORT = int(os.getenv("MCP_PORT", "8766"))

mcp = FastMCP(
    "materials-project",
    host=HTTP_HOST,
    port=HTTP_PORT,
    stateless_http=True,
)


def _describe_summary(doc) -> str:
    formula = getattr(doc, "formula_pretty", None) or str(doc.composition.reduced_formula)
    band_gap = getattr(doc, "band_gap", None)
    e_hull = getattr(doc, "energy_above_hull", None)
    return (
        f"Material ID: {doc.material_id}\n"
        f"Formula: {formula}\n"
        f"Band gap: {band_gap}\n"
        f"Energy above hull: {e_hull}"
    )


def _describe_structure(structure: Structure, *, structure_uri: str) -> str:
    lattice = structure.lattice
    return (
        f"Structure URI: {structure_uri}\n"
        f"Formula: {structure.composition.reduced_formula}\n"
        f"Num sites: {len(structure)}\n"
        f"Lattice a/b/c: {lattice.a:.4f}, {lattice.b:.4f}, {lattice.c:.4f}\n"
        f"Angles alpha/beta/gamma: {lattice.alpha:.2f}, {lattice.beta:.2f}, {lattice.gamma:.2f}"
    )


def _plot_structure_png(structure: Structure, duplication: list[int]) -> str:
    dup = duplication if len(duplication) == 3 else [1, 1, 1]
    repeated = structure.copy()
    repeated.make_supercell(dup)
    coords = repeated.cart_coords
    species = [str(site.specie) for site in repeated]
    labels = list(dict.fromkeys(species))
    color_map = {label: f"C{index % 10}" for index, label in enumerate(labels)}

    fig = plt.figure(figsize=(6.2, 5.4))
    ax = fig.add_subplot(111, projection="3d")
    for label in labels:
        mask = [spec == label for spec in species]
        xs = [coord[0] for coord, keep in zip(coords, mask) if keep]
        ys = [coord[1] for coord, keep in zip(coords, mask) if keep]
        zs = [coord[2] for coord, keep in zip(coords, mask) if keep]
        ax.scatter(xs, ys, zs, s=28, label=label, alpha=0.85, color=color_map[label])
    ax.set_xlabel("x (A)")
    ax.set_ylabel("y (A)")
    ax.set_zlabel("z (A)")
    ax.set_title(f"{repeated.composition.reduced_formula} structure")
    ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout()

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


@mcp.tool(name="search_materials_by_formula")
async def search_materials_by_formula(
    chemical_formula: Annotated[str, "Chemical formula like SrTiO3"],
) -> list[TextContent]:
    docs = get_mp_rester().summary.search(formula=chemical_formula)
    return [TextContent(type="text", text=_describe_summary(doc)) for doc in docs]


@mcp.tool(name="select_material_by_id")
async def select_material_by_id(
    material_id: Annotated[str, "Materials Project material id like mp-5229"],
) -> list[TextContent]:
    summary_doc = get_mp_rester().summary.get_data_by_id(material_id)
    structure_id, structure_uri = get_or_create_from_material_id(
        material_id,
        lambda: summary_doc.structure,
    )
    del structure_id
    return [
        TextContent(type="text", text=_describe_summary(summary_doc)),
        TextContent(type="text", text=f"structure uri: {structure_uri}"),
    ]


@mcp.tool(name="get_structure_data")
async def get_structure_data(
    structure_uri: Annotated[str, "URI like structure://..."],
    format: Annotated[Literal["cif", "poscar"], "Requested format"] = "cif",
) -> list[TextContent]:
    structure = load_structure(structure_uri)
    if format == "poscar":
        text = structure.to(fmt="poscar")
    else:
        text = structure.to(fmt="cif")
    return [TextContent(type="text", text=text)]


@mcp.tool(name="create_structure_from_poscar")
async def create_structure_from_poscar(
    poscar_str: Annotated[str, "Raw POSCAR text"],
) -> list[TextContent]:
    structure = Structure.from_str(poscar_str, fmt="poscar")
    structure_id, structure_uri = save_structure(structure)
    return [
        TextContent(type="text", text=f"Created structure id: {structure_id}"),
        TextContent(type="text", text=f"structure uri: {structure_uri}"),
        TextContent(type="text", text=_describe_structure(structure, structure_uri=structure_uri)),
    ]


@mcp.tool(name="create_structure_from_cif")
async def create_structure_from_cif(
    cif_str: Annotated[str, "Raw CIF text"],
) -> list[TextContent]:
    structure = Structure.from_str(cif_str, fmt="cif")
    structure_id, structure_uri = save_structure(structure)
    return [
        TextContent(type="text", text=f"Created structure id: {structure_id}"),
        TextContent(type="text", text=f"structure uri: {structure_uri}"),
        TextContent(type="text", text=_describe_structure(structure, structure_uri=structure_uri)),
    ]


@mcp.tool(name="plot_structure")
async def plot_structure(
    structure_uri: Annotated[str, "URI like structure://..."],
    duplication: Annotated[list[int], "Three integers for supercell display repetition"] = [1, 1, 1],
) -> list[ImageContent | TextContent]:
    structure = load_structure(structure_uri)
    png_base64 = _plot_structure_png(structure, duplication)
    return [
        TextContent(type="text", text=_describe_structure(structure, structure_uri=structure_uri)),
        ImageContent(type="image", data=png_base64, mimeType="image/png"),
    ]


@mcp.tool(name="build_supercell")
async def build_supercell(
    structure_uri: Annotated[str, "URI like structure://..."],
    scaling_matrix: Annotated[list[int], "Three integers, for example [2, 2, 1]"] = [2, 2, 1],
) -> list[TextContent]:
    structure = load_structure(structure_uri).copy()
    if len(scaling_matrix) != 3:
        raise ValueError("scaling_matrix must contain exactly three integers")
    structure.make_supercell(scaling_matrix)
    structure_id, new_uri = save_structure(structure)
    del structure_id
    return [
        TextContent(type="text", text=f"supercell structure uri: {new_uri}"),
        TextContent(type="text", text=_describe_structure(structure, structure_uri=new_uri)),
    ]


def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "streamable-http").strip() or "streamable-http"
    mcp.run(transport=transport)


if __name__ == "__main__":
    main()
