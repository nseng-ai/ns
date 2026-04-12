# pyproject.toml template

**Target path:** `packages/<DEV_PROJECT_NAME>/pyproject.toml`

## Placeholders

- `<DEV_PROJECT_NAME>` -- dev project name (e.g., `my-cool-lib-dev`)
- `<DEV_PACKAGE_NAME>` -- dev import name (e.g., `my_cool_lib_dev`)
- `<PROJECT_NAME>` -- root project name (e.g., `my-cool-lib`)
- `<MIN_PYTHON>` -- minimum Python version (e.g., `3.11`)

## Template

```toml
[project]
name = "<DEV_PROJECT_NAME>"
version = "0.1.0"
description = "Development tools for <PROJECT_NAME>"
requires-python = ">=<MIN_PYTHON>"
dependencies = [
    "click>=8.1.7",
]

[project.scripts]
<DEV_PROJECT_NAME> = "<DEV_PACKAGE_NAME>.__main__:cli"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/<DEV_PACKAGE_NAME>"]
```
