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
	type PreparedPrDescriptionUpdate,
	type PrDescriptionUpdateResult,
} from "./pr-description-orchestration.ts";
import type { PromptSource } from "./pr-description.ts";
import type { TextGenerator } from "./text-generation.ts";

export interface SdlPrDescriptionRuntime {
	githubPr: RealGithubPrGateway;
	git: GitGateway;
}

export type RegeneratedPrDescriptionResult = PrDescriptionUpdateResult;
export type RegeneratedPrDescriptionUpdate = Exclude<PrDescriptionUpdateResult, { type: "failed" }>;
export type RegeneratedPrDescriptionAlreadyCurrent = Extract<
	PrDescriptionUpdateResult,
	{ type: "skipped" }
>;
export type RegeneratedPrDescription = PreparedPrDescriptionUpdate;

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
		return { type: "failed", reason: `Could not resolve current branch PR.\n${pr.error.message}` };
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
	return await preparePrDescriptionUpdate({
		cwd: input.cwd,
		env: input.env,
		githubPr: input.githubPr,
		git: input.git,
		textGenerator: input.textGenerator,
		pr: input.pr,
		fingerprintPolicy: "skip-current",
	});
}

export async function applyRegeneratedPrDescription(input: {
	cwd: string;
	githubPr: GithubPrGateway;
	regenerated: PreparedPrDescriptionUpdate;
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
