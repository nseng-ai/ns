# clinkr

A library for building Click CLI commands that are both human-friendly and machine-readable. Define an operation once, get a standard CLI with options/arguments *and* a JSON-over-stdin/stdout variant automatically.

## Install

```bash
uv add clinkr
```

## Quick Start

Define a group with `@clinkr_group`, put operations in the same package, and use `discover_group` to assemble everything:

```python
# myapp/cli/__init__.py
from clinkr import ClinkrGroup, clinkr_group


@clinkr_group(help="My application.")
def myapp() -> ClinkrGroup:
    return ClinkrGroup()
```

```python
# myapp/cli/greet.py
from dataclasses import dataclass

from clinkr.machine_command import MachineCommandError
from clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class GreetRequest:
    name: str
    loud: bool = False


@dataclass(frozen=True)
class GreetResult:
    greeting: str


@clinkr_operation(name="greet", help="Greet someone by name.")
def greet(request: GreetRequest) -> GreetResult | MachineCommandError:
    greeting = f"Hello, {request.name}!"
    if request.loud:
        greeting = greeting.upper()
    return GreetResult(greeting=greeting)
```

```python
# myapp/main.py
from clinkr import discover_group

app = discover_group("myapp.cli")
```

`discover_group` imports the module, finds the `@clinkr_group`-decorated function, calls it to get a `ClinkrGroup`, applies the help text, and auto-discovers all `@clinkr_operation` functions in the package.

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

For larger CLIs, define each noun group in its own package with a `@clinkr_group`-decorated function, then assemble them under a parent `click.Group` using `discover_group`:

```
myapp/
  cli/
    users/
      __init__.py    <- @clinkr_group decorated function
      list.py        <- @clinkr_operation functions
      create.py
    projects/
      __init__.py    <- @clinkr_group decorated function
      list.py
      create.py
```

```python
# myapp/cli/users/__init__.py
from clinkr import ClinkrGroup, clinkr_group

@clinkr_group(help="Manage users.")
def users() -> ClinkrGroup:
    return ClinkrGroup()
```

```python
# myapp/main.py
import click
from clinkr import discover_group

app = click.Group("myapp")
app.add_command(discover_group("myapp.cli.users"))
app.add_command(discover_group("myapp.cli.projects"))
```

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

Decorator that marks a function as a clinkr operation. The function must accept exactly one parameter (the request dataclass) and return a result dataclass or `MachineCommandError`. Request type and result types are inferred from type annotations.

```python
@clinkr_operation(name="foo", help="Do foo.", aliases=("f",))
def foo(request: FooRequest) -> FooResult | MachineCommandError:
    ...
```

### `discover_group`

The main entry point for assembling a group. Given a module path, it:

1. Imports the module and finds the `@clinkr_group`-decorated function
2. Calls it to get a `ClinkrGroup`
3. Sets the group name from the function name and help from the decorator
4. Auto-discovers `@clinkr_operation` functions in the package

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

| Module | Purpose |
|---|---|
| `operation` | `@clinkr_operation` decorator and metadata |
| `group` | `ClinkrGroup`, `@clinkr_group` decorator, `discover_group` entry point |
| `machine_command` | JSON stdin/stdout wiring and `--schema` flag |
| `machine_schema` | JSON Schema generation from dataclasses |
| `params` | Dataclass-to-Click parameter extraction |
| `rendering` | Default human output renderer |
| `dataclass_json` | JSON serialization, deserialization, and schema helpers |
