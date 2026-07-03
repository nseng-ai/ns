import type { GitGateway } from "@sdl/capability-kit/git";
import { createSdlCommandRunner } from "@sdl/capability-kit";
import { createSdlGitGateway } from "@sdl/capability-kit/git";
import type { SdlExtensionApi } from "@sdl/kernel/sdk";
import {
	RealGithubPrGateway,
	type GithubPrDetails,
	type GithubPrGateway,
} from "./github-pr-gateway.ts";
import {
	applyPreparedPrDescriptionUpdate,
	preparePrDescriptionUpdate,
	type PrDescriptionUpdateResult,
} from "./pr-description-orchestration.ts";
import type { PromptSource } from "./pr-description.ts";
import type { TextGenerator } from "./text-generation.ts";

export interface SdlPrDescriptionRuntime {
	githubPr: RealGithubPrGateway;
	git: GitGateway;
}

export type RegeneratedPrDescriptionResult =
	| { ok: true; value: RegeneratedPrDescriptionUpdate }
	| { ok: false; error: string; exitCode?: number };

export type RegeneratedPrDescriptionUpdate =
	| RegeneratedPrDescriptionAlreadyCurrent
	| RegeneratedPrDescription;

export interface RegeneratedPrDescriptionAlreadyCurrent {
	type: "already_current";
	pr: GithubPrDetails;
	patchId: string;
	promptSource: PromptSource;
}

export interface RegeneratedPrDescription {
	type: "prepared";
	pr: GithubPrDetails;
	title: string;
	body: string;
	promptSource: PromptSource;
}

/** Temporary internal migration seam; not exported from `@sdl/kernel/sdk`. */
export function createSdlPrDescriptionRuntime(ctx: SdlExtensionApi): SdlPrDescriptionRuntime {
	const runner = createSdlCommandRunner(ctx);
	return {
		githubPr: new RealGithubPrGateway(runner),
		git: createSdlGitGateway(ctx),
	};
}

export async function prepareRegeneratedPrDescriptionForCurrentBranch(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	githubPr: GithubPrGateway;
	git: GitGateway;
	textGenerator: TextGenerator;
}): Promise<RegeneratedPrDescriptionResult> {
	const pr = await input.githubPr.viewCurrentBranchPr({ cwd: input.cwd });
	if (!pr.ok) {
		return { ok: false, error: `Could not resolve current branch PR.\n${pr.error.message}` };
	}
	return await prepareRegeneratedPrDescription({ ...input, pr: pr.value });
}

export async function prepareRegeneratedPrDescription(input: {
	cwd: string;
	env: Record<string, string | undefined>;
	githubPr: GithubPrGateway;
	git: GitGateway;
	textGenerator: TextGenerator;
	pr: GithubPrDetails;
}): Promise<RegeneratedPrDescriptionResult> {
	return formatRegeneratedPrDescriptionResult(
		await preparePrDescriptionUpdate({
			cwd: input.cwd,
			env: input.env,
			githubPr: input.githubPr,
			git: input.git,
			textGenerator: input.textGenerator,
			pr: input.pr,
			fingerprintPolicy: "skip-current",
		}),
	);
}

export async function applyRegeneratedPrDescription(input: {
	cwd: string;
	githubPr: GithubPrGateway;
	regenerated: RegeneratedPrDescription;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const edited = await applyPreparedPrDescriptionUpdate({
		cwd: input.cwd,
		githubPr: input.githubPr,
		update: input.regenerated,
	});
	if (!edited.ok) return { ok: false, error: edited.reason };
	return { ok: true };
}

export function formatPromptSourceLabel(source: PromptSource): string {
	return source.type === "builtin" ? "built-in" : source.path;
}

function formatRegeneratedPrDescriptionResult(
	result: PrDescriptionUpdateResult,
): RegeneratedPrDescriptionResult {
	switch (result.type) {
		case "skipped":
			return {
				ok: true,
				value: {
					type: "already_current",
					pr: result.pr,
					patchId: result.patchId,
					promptSource: result.promptSource,
				},
			};
		case "prepared":
			return {
				ok: true,
				value: {
					type: "prepared",
					pr: result.pr,
					title: result.title,
					body: result.body,
					promptSource: result.promptSource,
				},
			};
		case "failed":
			return {
				ok: false,
				error: result.reason,
				...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
			};
	}
}
