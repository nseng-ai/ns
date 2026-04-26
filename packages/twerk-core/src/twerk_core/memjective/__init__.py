"""Memjective: branch-scoped planning documents.

A memjective is a directory of files (``body.md`` plus optional
``roadmap.md`` / ``notes.md``) tracked across branches via git refs under
``refs/brmem/ns/memjectives/...``. This subpackage owns the ``memjective``
namespace, the document schema, the CLI surface, and the workflow contract
codified in the ``dev-memjective-*`` skills. Storage is delegated to
``twerk_core.brmem``; the schema, slug rules, and master-seed semantics live
here. See ``AGENTS.md`` for labs/extractability rules.
"""
