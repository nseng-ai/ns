export interface InteractiveClaudeInvocation {
	cwd: string;
	prompt: string;
	env: Record<string, string | undefined>;
	/** Display name passed to `claude --name`; omitted when no name is available. */
	name?: string;
}

export type InteractiveClaudeRunResult =
	| { type: "exited"; code: number | null; signal: string | null }
	| { type: "spawn-failed"; message: string };

export type RunInteractiveClaude = (
	invocation: InteractiveClaudeInvocation,
) => InteractiveClaudeRunResult;
