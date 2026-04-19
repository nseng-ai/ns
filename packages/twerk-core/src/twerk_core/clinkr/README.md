# clinkr: CLIs for Clankers

A library for building Click CLI commands that are both human-friendly and machine-readable. Define an operation once, get a standard CLI with options/arguments _and_ a JSON-over-stdin/stdout variant automatically.

## Install

```bash
uv add clinkr
```

## Quick Start

A clinkr CLI has two pieces:

- One file per operation, each exporting a function decorated with `@clinkr_operation`.
- A `group.py` module with an explicit `build_<name>_group()` function that imports each operation and constructs a `ClinkrGroup`.

The import list in `group.py` is the visible command inventory for the group. There is no autodiscovery.

```python
# myapp/cli/myapp/greet.py
from dataclasses import dataclass

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class GreetRequest:
    name: str
    loud: bool = False


@dataclass(frozen=True)
class GreetResult:
    greeting: str


@clinkr_operation(name="greet", help="Greet someone by name.")
def run_greet(ctx: click.Context, request: GreetRequest) -> GreetResult | ClinkrCommandError:
    greeting = f"Hello, {request.name}!"
    if request.loud:
        greeting = greeting.upper()
    return GreetResult(greeting=greeting)
```

```python
# myapp/cli/myapp/group.py
"""Explicit builder for the `myapp` CLI group."""

from twerk_core.clinkr.group import ClinkrGroup
from myapp.cli.myapp.greet import run_greet


def build_myapp_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="myapp",
        help="My application.",
        operations=[run_greet],
    )
```

```python
# myapp/main.py
from myapp.cli.myapp.group import build_myapp_group

app = build_myapp_group()
```

This produces a human CLI and a machine CLI from the same operation:

```
$ myapp greet --help
Usage: myapp greet [OPTIONS] NAME

  Greet someone by name.

Options:
  --loud

$ myapp greet Alice --loud
HELLO, ALICE!

$ echo '{"name": "Alice", "loud": true}' | myapp json greet
{"greeting": "HELLO, ALICE!", "success": true}

$ myapp json greet --schema
{
  "input_schema": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "loud": {"type": "boolean"}
    },
    "required": ["name"]
  },
  "output_schema": { ... },
  "error_schema": { ... }
}
```

## Nested Noun/Verb Structure

For larger CLIs, give each noun its own package with a `group.py` builder, and compose them explicitly in the parent builder:

```
myapp/
  cli/
    myapp/
      group.py         <- build_myapp_group (top-level)
      users/
        group.py       <- build_users_group
        list.py        <- @clinkr_operation functions
        create.py
      projects/
        group.py       <- build_projects_group
        list.py
        create.py
```

```python
# myapp/cli/myapp/users/group.py
from twerk_core.clinkr.group import ClinkrGroup
from myapp.cli.myapp.users.list import run_list_users
from myapp.cli.myapp.users.create import run_create_user


def build_users_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="users",
        help="Manage users.",
        operations=[run_list_users, run_create_user],
    )
```

```python
# myapp/cli/myapp/group.py
import click

from twerk_core.clinkr.group import ClinkrGroup
from myapp.cli.myapp.users.group import build_users_group
from myapp.cli.myapp.projects.group import build_projects_group


def build_myapp_group() -> ClinkrGroup:
    group = ClinkrGroup(name="myapp", help="My application.")
    group.add_command(build_users_group())
    group.add_command(build_projects_group())
    return group
```

Each `ClinkrGroup` gets its own `json` subgroup, so the machine-readable path is always `<noun> json <verb>`.

## Key Concepts

### `@clinkr_operation`

Decorator that marks a function as a clinkr operation. The function must accept exactly two parameters — `ctx: click.Context` followed by the request dataclass — and return a result dataclass or `ClinkrCommandError`. Clinkr threads the active Click context in so operations never have to fetch it from globals. Request type and result types are inferred from type annotations.

```python
@clinkr_operation(name="foo", help="Do foo.", aliases=("f",))
def run_foo(ctx: click.Context, request: FooRequest) -> FooResult | ClinkrCommandError:
    ...
```

### `ClinkrGroup`

A `click.Group` subclass that:

- Auto-creates a `json` subgroup for machine-readable variants of every registered command
- Supports command aliases
- Takes all operations at construction time via the `operations` parameter

### `build_<name>_group()`

By convention, every group package exposes an explicit builder function in `group.py` that constructs and returns a fully wired `ClinkrGroup`. Consumers import the builder directly; there is no runtime discovery step.

### Machine Commands

Every machine command accepts JSON on stdin and emits JSON on stdout. Responses are wrapped with `"success": true` or `"success": false` plus `error_type` and `message`.

Use `--schema` on any machine command to get the JSON Schema for its input and output.

### Parameter Mapping

Dataclass fields map to Click parameters automatically:

- Fields **without** defaults become positional `click.Argument`s
- Fields **with** defaults become `click.Option`s (flags for `bool = False`)
- Use `typing.Annotated` with a `click.Argument` or `click.Option` for explicit control

### Custom Rendering

Pass a `human_renderer` to `@clinkr_operation` to control how results are displayed in the human CLI. The default renderer serializes the result dataclass as indented JSON.

## Modules

| Module           | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `operation`      | `@clinkr_operation` decorator and metadata              |
| `group`          | `ClinkrGroup`                                           |
| `command`        | JSON stdin/stdout wiring and `--schema` flag            |
| `json_schema`    | JSON Schema generation from dataclasses                 |
| `params`         | Dataclass-to-Click parameter extraction                 |
| `rendering`      | Default human output renderer                           |
| `dataclass_json` | JSON serialization, deserialization, and schema helpers |
