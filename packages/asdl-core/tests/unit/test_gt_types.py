from __future__ import annotations

import pytest

from asdl_core.gt.types import StackInfo


def test_stack_info_rejects_empty_current() -> None:
    with pytest.raises(ValueError, match="StackInfo.current must name"):
        StackInfo(
            trunk="main",
            current="",
            ancestors=(),
            children=(),
            warnings=(),
        )
