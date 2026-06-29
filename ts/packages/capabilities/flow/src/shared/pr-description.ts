import type { GitGateway } from "@sdl/git";
import {
	PR_DESCRIPTION_GENERATOR_VERSION,
	RealGithubPrGateway,
	hashPrDescriptionPrompt,
	preparePrDescription,
	replaceOrInsertGeneratedRegion,
	resolvePrDescriptionGeneration,
	type GithubPrDetails,
	type GithubPrGateway,
	type PrCommitMessage,
	type PrDescriptionPromptContext,
	type PromptSource,
	type TextGenerator,
} from "../submit/index.ts";

import { createSdlCommandRunner } from "@sdl/capability-kit";
import { createSdlGitGateway } from "@sdl/capability-kit/git";
import type { SdlExtensionApi } from "sdl-sdk";

export { preparePrDescription } from "../submit/index.ts";
export type {
	GithubPrDetails,
	PrCommitMessage,
	PrDescriptionPromptContext,
	PreparedPrDescription,
	PromptSource,
} from "../submit/index.ts";

export interface SdlPrDescriptionRuntime {
	githubPr: RealGithubPrGateway;
	git: GitGateway;
}

export type RegeneratedPrDescriptionResult =
	| { ok: true; value: RegeneratedPrDescription }
	| { ok: false; error: string; exitCode?: number };

export interface RegeneratedPrDescription {
	pr: GithubPrDetails;
	title: string;
	body: string;
	promptSource: PromptSource;
}

/** Temporary internal migration seam; not exported from `sdl-sdk`. */
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
	const generation = await resolvePrDescriptionGeneration({
		cwd: input.cwd,
		env: input.env,
		git: input.git,
	});
	if (!generation.ok) {
		return {
			ok: false,
			error: generation.error,
			...(generation.exitCode === undefined ? {} : { exitCode: generation.exitCode }),
		};
	}

	const patchId = await input.githubPr.stablePatchIdForPr({
		cwd: input.cwd,
		number: input.pr.number,
		baseRefName: input.pr.baseRefName,
		headRefName: input.pr.headRefName,
	});
	if (!patchId.ok) return { ok: false, error: patchId.error.message };

	const commits = await input.githubPr.getPrCommitMessages({
		cwd: input.cwd,
		number: input.pr.number,
	});
	if (!commits.ok) return { ok: false, error: commits.error.message };

	const prepared = await preparePrDescription({
		textGenerator: input.textGenerator,
		modelRef: generation.modelRef,
		promptText: generation.promptText,
		context: buildGithubPrPromptContext({
			pr: input.pr,
			commitMessages: commits.value,
			diff: patchId.value.diff,
		}),
	});
	if (!prepared.ok) return { ok: false, error: prepared.error };

	return {
		ok: true,
		value: {
			pr: input.pr,
			title: prepared.title,
			body: replaceOrInsertGeneratedRegion(input.pr.body, prepared.body, {
				version: "2",
				patchId: patchId.value.patchId,
				promptHash: hashPrDescriptionPrompt(generation.promptText),
				generator: PR_DESCRIPTION_GENERATOR_VERSION,
			}),
			promptSource: generation.promptSource,
		},
	};
}

export async function applyRegeneratedPrDescription(input: {
	cwd: string;
	githubPr: GithubPrGateway;
	regenerated: RegeneratedPrDescription;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const edited = await input.githubPr.editPr({
		cwd: input.cwd,
		number: input.regenerated.pr.number,
		title: input.regenerated.title,
		body: input.regenerated.body,
	});
	if (!edited.ok) return { ok: false, error: edited.error.message };
	return { ok: true };
}

export function formatPromptSourceLabel(source: PromptSource): string {
	return source.type === "builtin" ? "built-in" : source.path;
}

function buildGithubPrPromptContext(input: {
	pr: GithubPrDetails;
	commitMessages: readonly PrCommitMessage[];
	diff: string;
}): PrDescriptionPromptContext {
	return {
		kind: "github",
		number: input.pr.number,
		url: input.pr.url,
		title: input.pr.title,
		headRefName: input.pr.headRefName,
		baseRefName: input.pr.baseRefName,
		commitMessages: input.commitMessages,
		diff: input.diff,
	};
}
