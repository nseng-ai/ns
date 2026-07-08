export interface SubagentDelegationDoctrineInput {
	isExploreHealthy: boolean;
	isForkedPiAgentHealthy: boolean;
}

const SUBAGENT_DELEGATION_INTRO = [
	"## Subagent delegation",
	"",
	"Pi sessions in this repo provide a subagent system from `@nseng-ai/ns-pi-subagents` (see that package's README). Use the built-in subagent tools according to the doctrine below.",
].join("\n");

const EXPLORE_DELEGATION_DOCTRINE = [
	"### `explore` — parallel read-only scouts",
	"",
	"- When a question spans several files, directories, or subsystems, fan out `explore` with parallel focused tasks instead of serial read/grep — delegate the reading, keep the conclusion.",
	"- Batch independent explore tasks into one call so they run concurrently.",
	"- Work directly when you already know the exact file or symbol, or the task is trivial.",
].join("\n");

const FORKED_PI_AGENT_DELEGATION_DOCTRINE = [
	"### `forked_pi_agent` — focused forked Pi process",
	"",
	"- Use it for a self-contained delegated task; the prompt must carry complete context — the child starts cold.",
	"- Act on the returned status and findings; open the child session file only when you need depth.",
].join("\n");

export function buildSubagentDelegationDoctrine(
	input: SubagentDelegationDoctrineInput,
): string | undefined {
	const sections: string[] = [];
	if (input.isExploreHealthy) sections.push(EXPLORE_DELEGATION_DOCTRINE);
	if (input.isForkedPiAgentHealthy) sections.push(FORKED_PI_AGENT_DELEGATION_DOCTRINE);
	if (sections.length === 0) return undefined;
	return [SUBAGENT_DELEGATION_INTRO, ...sections].join("\n\n");
}
