import type { ObjectiveRunnerContext, RunnerStepMode } from "./context.ts";

export interface ComposeRunnerCommitMessageOptions {
	subject: string;
	body?: string;
	slug: string;
	mode: RunnerStepMode;
}

/**
 * Child-proposed subject/body plus the deterministic provenance trailers that
 * make runner-produced commits mechanically identifiable (ADR 0022).
 */
export function composeRunnerCommitMessage(options: ComposeRunnerCommitMessageOptions): string {
	const trailers = [`Objective-Runner-Step: ${options.slug}`];
	if (options.mode === "recover") trailers.push("Objective-Runner-Mode: recover");
	const blocks = [options.subject];
	if (options.body !== undefined && options.body !== "") blocks.push(options.body);
	blocks.push(trailers.join("\n"));
	return blocks.join("\n\n");
}

export interface CommitRunnerStepOptions {
	slug: string;
	mode: RunnerStepMode;
	subject: string;
	body?: string;
	/** Live changed paths attested by the gate's statusPaths call. */
	changedPaths: readonly string[];
}

export type CommitRunnerStepResult =
	| { type: "ok"; commitSha: string; message: string }
	| { type: "error"; code: string; message: string };

/** Stages exactly the gate-attested changed paths, then commits them. */
export async function commitRunnerStep(
	ctx: ObjectiveRunnerContext,
	options: CommitRunnerStepOptions,
): Promise<CommitRunnerStepResult> {
	const staged = await ctx.git.stagePaths({ cwd: ctx.repoRoot, paths: options.changedPaths });
	if (!staged.ok) return { type: "error", code: staged.error.code, message: staged.error.message };

	const message = composeRunnerCommitMessage({
		subject: options.subject,
		...(options.body === undefined ? {} : { body: options.body }),
		slug: options.slug,
		mode: options.mode,
	});
	const committed = await ctx.git.commit({ cwd: ctx.repoRoot, message });
	if (!committed.ok) {
		return { type: "error", code: committed.error.code, message: committed.error.message };
	}
	return { type: "ok", commitSha: committed.value, message };
}
