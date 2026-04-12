# pyproject.toml template

**Target path:** `pyproject.toml`

## Placeholders

- `<PROJECT_NAME>` -- pypi project name (e.g., `my-cool-lib`)
- `<DESCRIPTION>` -- one-line description
- `<LICENSE_TYPE>` -- `MIT`, `Apache-2.0`, `BSD-3-Clause`, or omit if `none`
- `<AUTHOR_NAME>` -- author full name
- `<AUTHOR_EMAIL>` -- author email
- `<MIN_PYTHON>` -- minimum Python version (e.g., `3.11`)
- `<PACKAGE_NAME>` -- import name (e.g., `my_cool_lib`)
- `<TARGET_VERSION_RUFF>` -- `"py" + MIN_PYTHON` without dot (e.g., `py311`)

## Template

```toml
[project]
name = "<PROJECT_NAME>"
version = "0.1.0"
description = "<DESCRIPTION>"
readme = "README.md"
license = "<LICENSE_TYPE>"
authors = [
  { name = "<AUTHOR_NAME>", email = "<AUTHOR_EMAIL>" },
]
requires-python = ">=<MIN_PYTHON>"
dependencies = []

[dependency-groups]
dev = [
  "ruff>=0.11.0",
  "pytest>=8.0.0",
  "pytest-xdist>=3.8.0",
  "ty>=0.0.1a9",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/<PACKAGE_NAME>"]

[tool.ruff]
target-version = "<TARGET_VERSION_RUFF>"
line-length = 100
src = ["src"]
exclude = [".claude/", ".agents/skills/"]
force-exclude = true

[tool.ruff.lint]
select = [
  "E", # pycodestyle errors
  "F", # pyflakes
  "I", # isort (import sorting)
  "UP", # pyupgrade
  "B", # flake8-bugbear
]

[tool.ruff.lint.isort]
known-first-party = ["<PACKAGE_NAME>"]

[tool.ty.src]
include = ["src"]
exclude = [".agents/skills/", ".claude/skills/"]

[tool.ty.environment]
python-version = "<MIN_PYTHON>"
python = ".venv"

[tool.pytest.ini_options]
addopts = "-q"
testpaths = ["tests"]
xfail_strict = true
```

## CLI variant

If `HAS_CLI` is yes, add to `[project]`:

```toml
[project.scripts]
<PROJECT_NAME> = "<PACKAGE_NAME>.cli:main"
```

And add `"click>=8.1.7"` to the `dependencies` list.
