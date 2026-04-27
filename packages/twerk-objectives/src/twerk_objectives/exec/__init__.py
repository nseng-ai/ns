"""Hidden ``objective exec`` subgroup: skill-invoked operations.

Commands here are not for interactive humans — they are JSON-emitting
helpers that drive the ``objective-*`` skills (currently
``objective-current`` and ``objective-digest``). Per the repo's exec
convention they live under a hidden ``ClinkrGroup`` so top-level
``objective --help`` stays focused on user-facing inspection commands.
"""
