from __future__ import annotations

import json

import click

from asdl_core.clinkr.dataclass_json import JsonSerializable


def default_human_renderer(result: JsonSerializable) -> None:
    click.echo(json.dumps(result.to_json_dict(), indent=2))
