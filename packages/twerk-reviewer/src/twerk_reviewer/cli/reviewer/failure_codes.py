from __future__ import annotations

import re

from twerk_reviewer.models import ReviewerFailure

_FIRST_CAPITAL_SEQUENCE = re.compile("(.)([A-Z][a-z]+)")
_LOWER_OR_DIGIT_TO_CAPITAL = re.compile("([a-z0-9])([A-Z])")


def error_type_for_reviewer_failure(failure: ReviewerFailure) -> str:
    """Translate reviewer domain failures into Clinkr failure codes."""
    name = type(failure).__name__
    first_pass = _FIRST_CAPITAL_SEQUENCE.sub(r"\1_\2", name)
    return _LOWER_OR_DIGIT_TO_CAPITAL.sub(r"\1_\2", first_pass).lower()
