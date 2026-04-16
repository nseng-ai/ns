"""Tests for FakeWorkingMemoryGateway."""

from twerk_core.working_memory.testing import FakeWorkingMemoryGateway


def test_fake_working_memory_write_then_read_returns_content() -> None:
    fake = FakeWorkingMemoryGateway()

    fake.write("feat/x", {"plan.md": "# Plan\n"})

    assert fake.read("feat/x", "plan.md") == "# Plan\n"


def test_fake_working_memory_read_missing_branch_or_path_returns_none() -> None:
    fake = FakeWorkingMemoryGateway(initial_files={"feat/x": {"plan.md": "# Plan\n"}})

    assert fake.read("missing", "plan.md") is None
    assert fake.read("feat/x", "missing.md") is None


def test_fake_working_memory_write_preserves_existing_files() -> None:
    fake = FakeWorkingMemoryGateway(initial_files={"feat/x": {"plan.md": "# Plan\n"}})

    fake.write("feat/x", {"notes.md": "notes\n"})

    assert fake.read("feat/x", "plan.md") == "# Plan\n"
    assert fake.read("feat/x", "notes.md") == "notes\n"


def test_fake_working_memory_write_overwrites_same_path() -> None:
    fake = FakeWorkingMemoryGateway(initial_files={"feat/x": {"plan.md": "old\n"}})

    fake.write("feat/x", {"plan.md": "new\n"})

    assert fake.read("feat/x", "plan.md") == "new\n"


def test_fake_working_memory_exists_false_then_true() -> None:
    fake = FakeWorkingMemoryGateway()

    assert fake.exists("feat/x") is False

    fake.write("feat/x", {"plan.md": "# Plan\n"})

    assert fake.exists("feat/x") is True


def test_fake_working_memory_initial_files_seed_state() -> None:
    fake = FakeWorkingMemoryGateway(initial_files={"feat/x": {"plan.md": "# Plan\n"}})

    assert fake.exists("feat/x") is True
    assert fake.read("feat/x", "plan.md") == "# Plan\n"


def test_fake_working_memory_write_log_tracks_mutations() -> None:
    fake = FakeWorkingMemoryGateway()

    fake.write("feat/x", {"plan.md": "# Plan\n"})
    fake.write("feat/x", {"notes.md": "notes\n"})

    assert fake._write_log == [
        ("feat/x", {"plan.md": "# Plan\n"}),
        ("feat/x", {"notes.md": "notes\n"}),
    ]
