from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Registry(StrEnum):
    PYPI = "pypi"
    NPM = "npm"
    BREW = "brew"


class CheckStatus(StrEnum):
    AVAILABLE = "available"
    TAKEN = "taken"
    INVALID = "invalid"
    UNSUPPORTED = "unsupported"
    ERROR = "error"


@dataclass(frozen=True)
class RegistryCheckResult:
    registry: Registry
    input_name: str
    lookup_name: str
    status: CheckStatus
    message: str

    @classmethod
    def available(
        cls,
        registry: Registry,
        *,
        input_name: str,
        lookup_name: str,
    ) -> RegistryCheckResult:
        return cls(
            registry=registry,
            input_name=input_name,
            lookup_name=lookup_name,
            status=CheckStatus.AVAILABLE,
            message=f"{registry.value} package name is available",
        )

    @classmethod
    def taken(cls, registry: Registry, *, input_name: str, lookup_name: str) -> RegistryCheckResult:
        return cls(
            registry=registry,
            input_name=input_name,
            lookup_name=lookup_name,
            status=CheckStatus.TAKEN,
            message=f"{registry.value} package name is already taken",
        )

    @classmethod
    def invalid(
        cls,
        registry: Registry,
        *,
        input_name: str,
        lookup_name: str,
        message: str,
    ) -> RegistryCheckResult:
        return cls(
            registry=registry,
            input_name=input_name,
            lookup_name=lookup_name,
            status=CheckStatus.INVALID,
            message=message,
        )

    @classmethod
    def unsupported(
        cls,
        registry: Registry,
        *,
        input_name: str,
        message: str,
    ) -> RegistryCheckResult:
        return cls(
            registry=registry,
            input_name=input_name,
            lookup_name=input_name,
            status=CheckStatus.UNSUPPORTED,
            message=message,
        )

    @classmethod
    def error(
        cls,
        registry: Registry,
        *,
        input_name: str,
        lookup_name: str,
        message: str,
    ) -> RegistryCheckResult:
        return cls(
            registry=registry,
            input_name=input_name,
            lookup_name=lookup_name,
            status=CheckStatus.ERROR,
            message=message,
        )

    def to_json_dict(self) -> dict[str, str]:
        return {
            "registry": self.registry.value,
            "input_name": self.input_name,
            "lookup_name": self.lookup_name,
            "status": self.status.value,
            "message": self.message,
        }


@dataclass(frozen=True)
class PackageCheckReport:
    input_name: str
    results: tuple[RegistryCheckResult, ...]

    @property
    def exit_code(self) -> int:
        statuses = {result.status for result in self.results}
        if CheckStatus.INVALID in statuses:
            return 2
        if CheckStatus.UNSUPPORTED in statuses:
            return 2
        if CheckStatus.ERROR in statuses:
            return 2
        if CheckStatus.TAKEN in statuses:
            return 1
        return 0

    def to_json_dict(self) -> dict[str, object]:
        return {
            "name": self.input_name,
            "exit_code": self.exit_code,
            "results": [result.to_json_dict() for result in self.results],
        }
