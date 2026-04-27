"""Hidden ``memjective exec`` subgroup: skill-invoked operations.

Commands here are not for interactive humans — they are JSON-emitting
helpers that drive the ``dev-memjective-*`` skills (currently
``dev-memjective-digest``). Per the repo's exec convention they live under
a hidden ``ClinkrGroup`` so top-level ``memjective --help`` stays focused
on user-facing inspection commands.
"""
