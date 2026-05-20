from __future__ import annotations

import re

NPM_UNSCOPED_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
NPM_RESERVED_NAMES = frozenset({"node_modules", "favicon.ico"})
NPM_MAX_NAME_LENGTH = 214


def npm_validation_error(package_name: str) -> str | None:
    if not package_name:
        return "npm package name must not be empty"
    if package_name.startswith("@"):
        return "npm scoped package names are not supported in v1"
    if "/" in package_name:
        return "npm unscoped package names must not contain '/'"
    if len(package_name) > NPM_MAX_NAME_LENGTH:
        return "npm package names must be 214 characters or fewer"
    if package_name in NPM_RESERVED_NAMES:
        return f"{package_name!r} is reserved by npm"
    if package_name.lower() != package_name:
        return "npm package names must be lowercase"
    if NPM_UNSCOPED_NAME_PATTERN.fullmatch(package_name) is None:
        return (
            "npm package names must contain only lowercase letters, digits, '.', '_', or '-', "
            "and must start with a lowercase letter or digit"
        )
    return None
