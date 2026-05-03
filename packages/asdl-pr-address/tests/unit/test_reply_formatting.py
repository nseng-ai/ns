from __future__ import annotations

import pytest

from asdl_pr_address.cli.pr_address.reply_formatting import _resolution_summary


def test_resolution_summary_rejects_unknown_mode_and_names_valid_modes() -> None:
    with pytest.raises(ValueError) as excinfo:
        # Test subject: `mode` outside the Literal — verifies the runtime ValueError guard.
        _resolution_summary(mode="addressed", message="m", commit_sha="s")  # type: ignore[arg-type]

    message = str(excinfo.value)
    assert "Unsupported resolution mode: addressed" in message
    assert "Valid modes:" in message
    for expected in ("pre_existing", "fixed", "explained"):
        assert expected in message
