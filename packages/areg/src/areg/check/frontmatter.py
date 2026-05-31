from __future__ import annotations

import re
from pathlib import Path

_SKILL_FRONTMATTER_KEY_RE = re.compile(r"^(?P<key>[A-Za-z0-9_-]+):(?P<value>.*)$")


def parse_skill_frontmatter(skill_md: Path) -> dict[str, str]:
    lines = skill_md.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("missing opening frontmatter delimiter '---'")

    try:
        end_index = lines.index("---", 1)
    except ValueError as e:
        raise ValueError("missing closing frontmatter delimiter '---'") from e

    fields: dict[str, str] = {}
    current_key: str | None = None
    current_values: list[str] = []

    def flush_current() -> None:
        if current_key is None:
            return
        raw_value = " ".join(value for value in current_values if value).strip()
        if len(raw_value) >= 2 and raw_value[0] == raw_value[-1] and raw_value[0] in {'"', "'"}:
            raw_value = raw_value[1:-1]
        fields[current_key] = raw_value

    for line in lines[1:end_index]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            continue

        if not line.startswith((" ", "\t")):
            flush_current()
            match = _SKILL_FRONTMATTER_KEY_RE.match(line)
            if match is None:
                raise ValueError(f"invalid frontmatter line: {line!r}")
            current_key = match.group("key")
            current_values = []
            inline_value = match.group("value").strip()
            if inline_value:
                current_values.append(inline_value)
            continue

        if current_key is None:
            raise ValueError(f"invalid frontmatter line: {line!r}")
        current_values.append(line.strip())

    flush_current()
    return fields
