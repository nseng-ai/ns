"""Shared JSON schema for structured review findings."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FINDINGS_JSON_SCHEMA_PATH = Path(__file__).with_name("findings_schema.json")

FINDINGS_JSON_SCHEMA: dict[str, Any] = json.loads(
    FINDINGS_JSON_SCHEMA_PATH.read_text(encoding="utf-8")
)
