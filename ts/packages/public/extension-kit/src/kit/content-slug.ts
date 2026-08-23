import { normalizeBranchSlugText, trimBranchSlugToLength } from "@nseng-ai/foundation/branch-slug";
import { formatOutputSection } from "@nseng-ai/foundation/command";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { Result } from "@nseng-ai/foundation/result";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import { deriveSlugWithModel, type SlugModelEvidence } from "./model-slug.ts";
import { MODEL_OPERATION_IDS, resolveProjectModelOperation } from "./model-policy.ts";

const MAX_ERROR_CHARS = 4_000;

export type ContentSlugEvidence = SlugModelEvidence;

export interface ContentSlugFailure {
	readonly code: "content-slug-failed";
	readonly message: string;
}

export type ContentSlugResult = Result<ContentSlugEvidence, ContentSlugFailure>;

export type ContentSlugGitGateway = Pick<GitGateway, "optionalRepoRoot">;

export interface ContentSlugContext {
	commands: CommandExecApi;
	git: ContentSlugGitGateway;
	projectConfig: ProjectConfigGateway;
}

export interface ContentSlugPolicy {
	slugKind: string;
	promptIntroLines: readonly string[];
	promptRuleLines: readonly string[];
	contentHeading: string;
	emptyContentPlaceholder: string;
	maxContentChars: number;
	truncationMessage: string;
	invalidSlugMessage: string;
	failureHeader: string;
	noFallbackLine: string;
	normalization: {
		maxWords?: number;
		maxChars?: number;
		stripSuffixes?: readonly string[];
	};
	validateSlug(slug: string): string | undefined;
}

export interface DeriveContentSlugInput {
	content: string;
	cwd: string;
	signal?: AbortSignal;
}

export async function deriveContentSlug(
	context: ContentSlugContext,
	input: DeriveContentSlugInput,
	policy: ContentSlugPolicy,
): Promise<ContentSlugResult> {
	const repository = await context.git.optionalRepoRoot({
		cwd: input.cwd,
		...optionalEntry("signal", input.signal),
	});
	if (repository.type !== "found") {
		return contentSlugFailure("Could not determine the repository root for ns.toml.");
	}

	const model = resolveProjectModelOperation({
		repoRoot: repository.value,
		gateway: context.projectConfig,
		operationId: MODEL_OPERATION_IDS.slug,
	});
	if (!model.ok) {
		return contentSlugFailure(`Invalid model policy in ns.toml: ${model.error.message}`);
	}

	const result = await deriveSlugWithModel({
		cwd: input.cwd,
		modelSelection: model.value.selection,
		prompt: buildContentSlugPrompt(input.content, policy),
		...optionalEntry("signal", input.signal),
		slugKind: policy.slugKind,
		normalizeOutput: (output) => normalizeContentSlugOutput(output, policy.normalization),
		exec: (command, args, options) => context.commands.exec(command, args, options),
	});
	if (!result.ok) {
		return contentSlugDerivationFailed(policy, result.failure.lines);
	}

	const { slug, rawOutput } = result.evidence;
	const slugError = policy.validateSlug(slug);
	if (slugError !== undefined) {
		return contentSlugDerivationFailed(policy, [
			policy.invalidSlugMessage,
			`Normalized slug: ${slug}`,
			`Reason: ${slugError}`,
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	return { ok: true, value: result.evidence };
}

function buildContentSlugPrompt(content: string, policy: ContentSlugPolicy): string {
	return [
		...policy.promptIntroLines,
		"Return exactly one slug and no prose.",
		"Rules:",
		...policy.promptRuleLines,
		"",
		policy.contentHeading,
		truncateContentForSlug(displayContentForSlug(content, policy), policy),
	].join("\n");
}

function normalizeContentSlugOutput(
	value: string,
	options: ContentSlugPolicy["normalization"],
): string | undefined {
	const firstLine = firstNonEmptyModelOutputLine(value);
	if (firstLine === undefined) return undefined;

	const slug = normalizeBranchSlugText(firstLine);
	const withoutSuffix = removeSuffixes(slug, options.stripSuffixes ?? []);
	if (withoutSuffix.length === 0) return undefined;

	const words = withoutSuffix.split("-").filter(Boolean);
	const wordLimited = (
		options.maxWords === undefined ? words : words.slice(0, options.maxWords)
	).join("-");
	const repaired =
		options.maxChars === undefined
			? wordLimited
			: trimBranchSlugToLength(wordLimited, options.maxChars);
	return repaired.length > 0 ? repaired : undefined;
}

function truncateContentForSlug(
	content: string,
	policy: Pick<ContentSlugPolicy, "maxContentChars" | "truncationMessage">,
): string {
	if (content.length <= policy.maxContentChars) return content;
	return `${content.slice(0, policy.maxContentChars)}\n\n${policy.truncationMessage}`;
}

function firstNonEmptyModelOutputLine(value: string): string | undefined {
	return value
		.replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?|```/g, ""))
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

function displayContentForSlug(content: string, policy: ContentSlugPolicy): string {
	const trimmed = content.trim();
	return trimmed.length > 0 ? trimmed : policy.emptyContentPlaceholder;
}

function removeSuffixes(slug: string, suffixes: readonly string[]): string {
	let current = slug;
	let hasRemovedSuffix = true;
	while (hasRemovedSuffix) {
		hasRemovedSuffix = false;
		for (const suffix of suffixes) {
			if (current.endsWith(suffix)) {
				const candidate = current.slice(0, -suffix.length).replace(/^-|-$/g, "");
				if (candidate.length > 0) {
					current = candidate;
					hasRemovedSuffix = true;
				}
			}
		}
	}
	return current;
}

function contentSlugDerivationFailed(
	policy: ContentSlugPolicy,
	lines: readonly string[],
): ContentSlugResult {
	return contentSlugFailure([policy.failureHeader, ...lines, policy.noFallbackLine].join("\n"));
}

function contentSlugFailure(message: string): ContentSlugResult {
	return { ok: false, error: { code: "content-slug-failed", message } };
}
