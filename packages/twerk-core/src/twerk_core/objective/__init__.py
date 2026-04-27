"""Objective: branch-scoped planning documents.

A objective is a directory of files (``body.md`` plus optional
``roadmap.md`` / ``notes.md``) tracked across branches via git refs under
``refs/brmem/ns/objectives/...``. This subpackage owns the ``objective``
namespace, the document schema, the CLI surface, and the workflow contract
codified in the ``objective-*`` skills. Storage is delegated to
``twerk_core.brmem``; the schema, slug rules, and canonical-record semantics
live here. See ``AGENTS.md`` for labs/extractability rules.
"""
