from __future__ import annotations

import json
from typing import Any

import click

from asdl_core.clinkr.dataclass_json import serialize_to_json_dict


def default_human_renderer(result: Any) -> None:
    click.echo(json.dumps(serialize_to_json_dict(result), indent=2))
