# Cmux read-only posture

For observational ccc skills, collect and report evidence without mutating live session state.

Do not, unless the user separately asks for a follow-up mutation:

- change cmux focus, workspace/surface names, lifecycle, or pane input;
- mutate Git or Graphite state;
- edit local files or durable agent state such as Objective records, Branch Memory, handoffs, or branch-context attachments;
- call write-capable GitHub operations.

If the user asks for cleanup or continuation after the report, treat it as a separate follow-up task with the appropriate skill.
