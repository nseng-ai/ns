# clinkr: CLIs for Clankers

A library for building Click CLI commands that are both human-friendly and machine-readable. Define an operation once, get a standard CLI with options/arguments _and_ a JSON-over-stdin/stdout variant automatically.

## Install

```bash
uv add clinkr
```

## Quick Start

The default API is:

- Put operations in the same package
- Set the package docstring to the group help text
- Use `discover_group` to assemble everything

The subpackage after `cli/` becomes the group name, and each submodule is a command:

```python
# myapp/cli/myapp/__init__.py
"""My application."""
```

```python
# myapp/cli/myapp/greet.py
from dataclasses import dataclass

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class GreetRequest:
    name: str
    loud: bool = False


@dataclass(frozen=True)
class GreetResult:
    greeting: str


@clinkr_operation(name="greet", help="Greet someone by name.")
def greet(request: GreetRequest) -> GreetResult | ClinkrCommandError:
    greeting = f"Hello, {request.name}!"
    if request.loud:
        greeting = greeting.upper()
    return GreetResult(greeting=greeting)
```

```python
# myapp/main.py
from clinkr.group import discover_group

app = discover_group("myapp.cli.myapp")
```

`discover_group` imports the module, auto-discovers all `@clinkr_operation` functions in the package, and builds a `ClinkrGroup` named from the module path. The module docstring becomes the default group help. If the module also defines a `@clinkr_group` function, that return value is used instead and its metadata is applied.

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

For larger CLIs, define each noun group in its own package and let the package docstring carry the group help:

```
myapp/
  cli/
    users/
      __init__.py    <- default group help via module docstring
      list.py        <- @clinkr_operation functions
      create.py
    projects/
      __init__.py    <- default group help via module docstring
      list.py
      create.py
```

```python
# myapp/cli/users/__init__.py
"""Manage users."""
```

```python
# myapp/main.py
import click
from clinkr.group import discover_group

app = click.Group("myapp")
app.add_command(discover_group("myapp.cli.users"))
app.add_command(discover_group("myapp.cli.projects"))
```

Use `@clinkr_group` only when the defaults are not enough and you need custom help metadata or a custom base `ClinkrGroup`.

```
$ myapp users list --help
Usage: myapp users list [OPTIONS]

  List all users matching a filter.

Options:
  --team TEXT
  --active / --no-active

$ myapp users list --team backend --active
alice  backend  active
bob    backend  active

$ echo '{"team": "backend", "active": true}' | myapp users json list
{"users": [...], "success": true}

$ myapp projects create --help
Usage: myapp projects create [OPTIONS] NAME

  Create a new project.

Options:
  --description TEXT
  --private
```

Each `ClinkrGroup` gets its own `json` subgroup, so the machine-readable path is always `<noun> json <verb>`.

## Key Concepts

### `@clinkr_operation`

Decorator that marks a function as a clinkr operation. The function must accept exactly one parameter (the request dataclass) and return a result dataclass or `ClinkrCommandError`. Request type and result types are inferred from type annotations.

```python
@clinkr_operation(name="foo", help="Do foo.", aliases=("f",))
def foo(request: FooRequest) -> FooResult | ClinkrCommandError:
    ...
```

### `discover_group`

The main entry point for assembling a group. Given a module path, it:

1. Imports the module and auto-discovers `@clinkr_operation` functions in the package
2. Builds a default `ClinkrGroup` named from the module path
3. Uses the module docstring as the default group help
4. If present, applies a `@clinkr_group` function for custom group configuration and help metadata

### `@clinkr_group`

Optional decorator for packages that need custom help text or a custom base `ClinkrGroup`.

### `ClinkrGroup`

A `click.Group` subclass that:

- Auto-creates a `json` subgroup for machine-readable variants of every registered command
- Supports command aliases

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

| Module           | Purpose                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `operation`      | `@clinkr_operation` decorator and metadata                             |
| `group`          | `ClinkrGroup`, `@clinkr_group` decorator, `discover_group` entry point |
| `command`        | JSON stdin/stdout wiring and `--schema` flag                           |
| `json_schema`    | JSON Schema generation from dataclasses                                |
| `params`         | Dataclass-to-Click parameter extraction                                |
| `rendering`      | Default human output renderer                                          |
| `dataclass_json` | JSON serialization, deserialization, and schema helpers                |
