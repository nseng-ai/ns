// Pi intentionally excludes Bash here; Claude Code's investigator has a separate host-native
// contract with diagnostic Bash/Glob.
export const PI_INVESTIGATOR_CHILD_TOOL_NAMES = ["read", "grep", "find", "ls"] as const;
