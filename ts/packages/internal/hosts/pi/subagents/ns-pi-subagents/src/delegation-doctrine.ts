export const SUBAGENT_DELEGATION_INTRO = [
	"## Subagent delegation",
	"",
	"Pi sessions in this repo provide a subagent system from `@internal/ns-pi-subagents` (see that package's README). Use the built-in `subagent` tool according to the doctrine below.",
].join("\n");

export function buildSubagentDelegationDoctrine(sections: readonly string[]): string | undefined {
	const activeSections = sections.filter((section) => section.trim().length > 0);
	if (activeSections.length === 0) return undefined;
	return [SUBAGENT_DELEGATION_INTRO, ...activeSections].join("\n\n");
}
