---
name: dignified-python
disable-model-invocation: true
description: "Production Python coding standards with automatic version detection (3.10-3.13). Use when writing, reviewing, or refactoring Python to ensure adherence to modern type syntax, LBYL exception handling, pathlib operations, ABC-based interfaces, and production-tested patterns."
references:
  - dignified-python-core
  - cli-patterns
  - subprocess
  - versions/python-3.10
  - versions/python-3.11
  - versions/python-3.12
  - versions/python-3.13
  - references/module-design
  - references/checklists
  - references/advanced/api-design
  - references/advanced/exception-handling
  - references/advanced/interfaces
  - references/advanced/typing-advanced
---

# dignified-python

Production-quality Python coding standards for writing clean, maintainable, modern Python code
(versions 3.10-3.13).

## Core Knowledge

Read `dignified-python-core.md` (in this skill's directory) first, before writing or reviewing
any Python — it carries the core standards covering the 80% case.

## Version Detection

**Identify the project's minimum Python version** by checking (in order):

1. `pyproject.toml` - Look for `requires-python` field (e.g., `requires-python = ">=3.12"`)
2. `setup.py` or `setup.cfg` - Look for `python_requires`
3. `.python-version` file - Contains version like `3.12` or `3.12.0`
4. Default to Python 3.12 if no version specifier found

Detection happens once per task. Load exactly one matching file: `versions/python-3.10.md`,
`versions/python-3.11.md`, `versions/python-3.12.md`, or `versions/python-3.13.md`.

## Reference Routing

Core knowledge plus the version file cover 80%+ of Python code patterns. Load each file below
only when one of its triggers fires. Every file is self-contained with complete guidance for
its domain.

### `cli-patterns.md` — CLI patterns (click, argparse)

**Read when**: the task mentions "click" or "CLI", including CLI argument parsing.

### `subprocess.md` — subprocess patterns

**Read when**: the task mentions "subprocess" or runs external commands.

### `references/module-design.md` — module organization and import-time behavior

**Read when**:

- Creating new Python modules
- Adding module-level code (beyond simple constants)
- Using @cache decorator at module level
- Seeing Path() or computation at module level
- Considering inline imports

### `references/advanced/exception-handling.md` — LBYL patterns, error boundaries

**Read when**:

- Writing try/except blocks
- Wrapping third-party APIs that may raise
- Seeing or writing `from e` or `from None`
- Unsure if LBYL alternative exists

### `references/advanced/interfaces.md` — ABC and Protocol patterns

**Read when**:

- Creating ABC or Protocol classes
- Writing @abstractmethod decorators
- Designing gateway layer interfaces
- Choosing between ABC and Protocol

### `references/advanced/typing-advanced.md` — advanced typing patterns

**Read when**:

- Using typing.cast()
- Creating Literal type aliases
- Narrowing types in conditional blocks

### `references/advanced/api-design.md` — API design principles

**Read when**:

- Adding default parameter values to functions
- Defining functions with 5 or more parameters
- Using ThreadPoolExecutor.submit()
- Reviewing function signatures

### `references/checklists.md` — review checklists

**Read when**:

- Final review before committing Python code
- Unsure if you've followed all rules
- Need a quick lookup of requirements
