from __future__ import annotations

import dataclasses
import json
from typing import Any

import click


def default_human_renderer(result: Any) -> None:
    if hasattr(result, "to_json_dict"):
        data = result.to_json_dict()
    elif dataclasses.is_dataclass(result) and not isinstance(result, type):
        data = dataclasses.asdict(result)
    else:
        raise TypeError(
            f"Cannot render {type(result).__name__}: no to_json_dict() and not a dataclass"
        )
    click.echo(json.dumps(data, indent=2))
