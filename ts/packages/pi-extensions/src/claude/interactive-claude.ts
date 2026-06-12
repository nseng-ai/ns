export interface InteractiveClaudeInvocation {
	cwd: string;
	prompt: string;
	env: Record<string, string | undefined>;
}

export type InteractiveClaudeRunResult =
	| { type: "exited"; code: number | null; signal: string | null }
	| { type: "spawn-failed"; message: string };

export type RunInteractiveClaude = (invocation: InteractiveClaudeInvocation) => InteractiveClaudeRunResult;
