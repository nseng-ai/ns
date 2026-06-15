from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

TOKEN_PREFIX = "@@ASDL_"
REQUIRED_ENV_VARS = (
    "ASDL_TEMPLATE",
    "ASDL_OUTPUT",
    "ASDL_TOOL",
    "ASDL_CANONICAL_CHECKOUT",
    "ASDL_CLI_REL_PATH",
    "ASDL_INSTALL_HINT",
)


def main() -> int:
    missing_env_vars = [name for name in REQUIRED_ENV_VARS if name not in os.environ]
    if missing_env_vars:
        missing = ", ".join(missing_env_vars)
        print(
            f"render-cli-shim.py: missing required environment variables: {missing}",
            file=sys.stderr,
        )
        return 2

    template_path = Path(os.environ["ASDL_TEMPLATE"])
    output_path = Path(os.environ["ASDL_OUTPUT"])
    replacements = {
        "@@ASDL_TOOL@@": shlex.quote(os.environ["ASDL_TOOL"]),
        "@@ASDL_CANONICAL_CHECKOUT@@": shlex.quote(os.environ["ASDL_CANONICAL_CHECKOUT"]),
        "@@ASDL_CLI_REL_PATH@@": shlex.quote(os.environ["ASDL_CLI_REL_PATH"]),
        "@@ASDL_INSTALL_HINT@@": shlex.quote(os.environ["ASDL_INSTALL_HINT"]),
    }

    rendered = template_path.read_text(encoding="utf-8")
    for token, value in replacements.items():
        rendered = rendered.replace(token, value)

    if TOKEN_PREFIX in rendered:
        print(
            f"render-cli-shim.py: unrendered shim token remains in {template_path}",
            file=sys.stderr,
        )
        return 2

    output_path.write_text(rendered, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
