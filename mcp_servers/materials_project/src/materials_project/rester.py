from __future__ import annotations

import os
from functools import lru_cache

from mp_api.client import MPRester


@lru_cache(maxsize=1)
def get_mp_rester() -> MPRester:
    api_key = os.getenv("MP_API_KEY", "").strip()
    if not api_key:
        raise ValueError("MP_API_KEY is required for the materials-project MCP server.")
    return MPRester(api_key)
