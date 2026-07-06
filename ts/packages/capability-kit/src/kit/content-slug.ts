import { formatOutputSection } from "@nseng-ai/foundation/command";
import { normalizeBranchSlugText } from "@nseng-ai/foundation/branch-slug";
import {
	deriveSlugWithModel,
	type SlugModelCommandResult,
	type SlugModelEvidence,
	type SlugModelExecOptions,
} from "./model-slug.ts";

const MAX_ERROR_CHARS = 4_000;

export type ContentSlugEvidence = SlugModelEvidence;

export interface ContentSlugExecApi {
	exec(
		command: string,
		args: string[],
		options: SlugModelExecOptions,
	): Promise<SlugModelCommandResult>;
}

export interface ContentSlugDerivationVariant {
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
	normalization: ContentSlugNormalizationOptions;
	validateSlug(slug: string): string | undefined;
}

export interface ContentSlugNormalizationOptions {
	maxWords: number;
	stripSuffixes?: readonly string[];
}

export interface DeriveContentSlugInput {
	content: string;
	cwd: string;
	signal?: AbortSignal;
}

export type KitContentSlugDerivationVariant = ContentSlugDerivationVariant;

export async function deriveKitContentSlug(
	execApi: ContentSlugExecApi,
	input: DeriveContentSlugInput,
	variant: ContentSlugDerivationVariant,
): Promise<ContentSlugEvidence> {
	const prompt = buildKitContentSlugPrompt(input.content, variant);
	const result = await deriveSlugWithModel({
		cwd: input.cwd,
		prompt,
		...(input.signal === undefined ? {} : { signal: input.signal }),
		slugKind: variant.slugKind,
		normalizeOutput: (output) => normalizeContentSlugOutput(output, variant.normalization),
		exec: (command, args, options) => execApi.exec(command, args, options),
	});
	if (!result.ok) {
		throw contentSlugDerivationFailed(variant, result.failure.lines);
	}

	const { slug, rawOutput } = result.evidence;
	const slugError = variant.validateSlug(slug);
	if (slugError !== undefined) {
		throw contentSlugDerivationFailed(variant, [
			variant.invalidSlugMessage,
			`Normalized slug: ${slug}`,
			`Reason: ${slugError}`,
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	return result.evidence;
}

export function buildKitContentSlugPrompt(
	content: string,
	variant: ContentSlugDerivationVariant,
): string {
	return [
		...variant.promptIntroLines,
		"Return exactly one slug and no prose.",
		"Rules:",
		...variant.promptRuleLines,
		"",
		variant.contentHeading,
		truncateContentForSlug(displayContentForSlug(content, variant), variant),
	].join("\n");
}

export function normalizeContentSlugOutput(
	value: string,
	options: ContentSlugNormalizationOptions,
): string | undefined {
	const firstLine = firstNonEmptyModelOutputLine(value);
	if (firstLine === undefined) {
		return undefined;
	}

	const slug = normalizeBranchSlugText(firstLine);
	const withoutSuffix = removeSuffixes(slug, options.stripSuffixes ?? []);
	if (withoutSuffix.length === 0) {
		return undefined;
	}

	const repaired = withoutSuffix.split("-").filter(Boolean).slice(0, options.maxWords).join("-");
	return repaired.length > 0 ? repaired : undefined;
}

export function truncateContentForSlug(
	content: string,
	variant: Pick<ContentSlugDerivationVariant, "maxContentChars" | "truncationMessage">,
): string {
	if (content.length <= variant.maxContentChars) {
		return content;
	}
	return `${content.slice(0, variant.maxContentChars)}\n\n${variant.truncationMessage}`;
}

export function firstNonEmptyModelOutputLine(value: string): string | undefined {
	return value
		.replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?|```/g, ""))
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

function displayContentForSlug(content: string, variant: ContentSlugDerivationVariant): string {
	const trimmed = content.trim();
	return trimmed.length > 0 ? trimmed : variant.emptyContentPlaceholder;
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
	variant: ContentSlugDerivationVariant,
	lines: readonly string[],
): Error {
	return new Error([variant.failureHeader, ...lines, variant.noFallbackLine].join("\n"));
}
