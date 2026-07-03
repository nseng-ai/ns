# Semantic Update: slot gc themed cleanup report and prompt seam

`slot gc` inner human report body moved from plain line-log text to a themed table/detail presentation: action, slot, branch, and PR metadata now render as table cells, with cleanup details nested under affected rows and a compact summary line.

Shared Slot cleanup rendering was refreshed for both `slot gc` and `slot free --all`: preview lines now use human wording such as `would close PR #12` and `would force-delete local branch feature/a` instead of implementation-y labels like `PR: close #12` or `local branch: force-delete ...`.

A boundary-safe confirmation prompt pilot was added through an optional Clinkr prompt formatter hook. Clinkr remains theme-neutral; Slot supplies muted suffix styling from the command host/context when terminal caps are available.
