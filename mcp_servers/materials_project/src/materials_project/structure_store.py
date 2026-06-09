from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

from pymatgen.core import Structure


def _workdir() -> Path:
    root = os.getenv("MATERIALS_PROJECT_WORKDIR", "").strip()
    if root:
        return Path(root).expanduser().resolve()
    return Path.cwd() / "workdir" / "materials-project"


def _structures_dir() -> Path:
    directory = _workdir() / "structures"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _index_file() -> Path:
    path = _workdir() / "material_id_index.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def load_index() -> dict[str, str]:
    path = _index_file()
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_index(data: dict[str, str]) -> None:
    _index_file().write_text(json.dumps(data, indent=2), encoding="utf-8")


def save_structure(structure: Structure, material_id: str | None = None) -> tuple[str, str]:
    structure_id = str(uuid.uuid4())
    structure_uri = f"structure://{structure_id}"
    folder = _structures_dir() / structure_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "structure.cif").write_text(structure.to(fmt="cif"), encoding="utf-8")
    metadata: dict[str, Any] = {
        "structure_id": structure_id,
        "material_id": material_id,
        "formula": structure.composition.reduced_formula,
        "num_sites": len(structure),
    }
    (folder / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    if material_id:
        index = load_index()
        index[material_id] = structure_id
        save_index(index)
    return structure_id, structure_uri


def get_structure_path(structure_uri: str) -> Path:
    if not structure_uri.startswith("structure://"):
        raise ValueError("structure_uri must start with structure://")
    structure_id = structure_uri.split("structure://", 1)[1]
    return _structures_dir() / structure_id / "structure.cif"


def load_structure(structure_uri: str) -> Structure:
    path = get_structure_path(structure_uri)
    if not path.exists():
        raise FileNotFoundError(f"Structure file not found for {structure_uri}")
    return Structure.from_file(path)


def get_or_create_from_material_id(material_id: str, structure_factory) -> tuple[str, str]:
    index = load_index()
    existing = index.get(material_id)
    if existing:
        return existing, f"structure://{existing}"
    structure = structure_factory()
    return save_structure(structure=structure, material_id=material_id)
