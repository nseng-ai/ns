from __future__ import annotations

import re

from vibechk.ids import generate_run_id


def test_generate_run_id_is_eight_lowercase_hex_chars() -> None:
    run_id = generate_run_id()

    assert re.fullmatch(r"[0-9a-f]{8}", run_id) is not None
