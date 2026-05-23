from __future__ import annotations

import re

NPM_UNSCOPED_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
NPM_RESERVED_NAMES = frozenset({"node_modules", "favicon.ico"})
NPM_MAX_NAME_LENGTH = 214


def npm_validation_error(package_name: str) -> str | None:
    if not package_name:
        return "npm package name must not be empty"
    if len(package_name) > NPM_MAX_NAME_LENGTH:
        return "npm package names must be 214 characters or fewer"

    if package_name.startswith("@"):
        return _scoped_validation_error(package_name)

    if "/" in package_name:
        return "npm unscoped package names must not contain '/'"
    return _segment_validation_error(package_name)


def _scoped_validation_error(package_name: str) -> str | None:
    body = package_name[1:]
    if "/" not in body:
        return "npm scoped package names must have the form '@scope/name'"
    scope, _, name = body.partition("/")
    if "/" in name:
        return "npm scoped package names must not contain more than one '/'"
    if scope == "":
        return "npm scoped package names must have a non-empty scope"
    if name == "":
        return "npm scoped package names must have a non-empty name"

    scope_error = _segment_validation_error(scope)
    if scope_error is not None:
        return f"npm scope: {scope_error}"
    name_error = _segment_validation_error(name)
    if name_error is not None:
        return f"npm package: {name_error}"
    return None


def _segment_validation_error(segment: str) -> str | None:
    if segment in NPM_RESERVED_NAMES:
        return f"{segment!r} is reserved by npm"
    if segment.lower() != segment:
        return "npm package names must be lowercase"
    if NPM_UNSCOPED_NAME_PATTERN.fullmatch(segment) is None:
        return (
            "npm package names must contain only lowercase letters, digits, '.', '_', or '-', "
            "and must start with a lowercase letter or digit"
        )
    return None
