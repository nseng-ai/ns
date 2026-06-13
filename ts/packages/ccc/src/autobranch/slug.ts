import type { CommandResult } from "@asdl/sdl/checkpoint-flow";

import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName } from "@asdl/pi-extension-runtime/branch-slug";
import { deriveSlugWithModel, formatSlugModelFailure, SLUG_MODEL_TIMEOUT_MS, type SlugModelFailure } from "@asdl/plans";
import { truncateText } from "./shared.ts";

export const MAX_DIFF_CHARS = 24_000;

export type RequestedBranchSlugResult =
	| { kind: "absent" }
	| { kind: "slug"; baseSlug: string; source: "requested" }
	| { kind: "invalid_requested_slug"; requestedSlug: string };

export const BRANCH_SLUG_RULES = [
	"- Return only the slug, with no quotes, markdown, or explanation.",
	"- Use kebab-case lowercase ASCII words separated by hyphens.",
	`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
	"- Lead with a verb when natural, such as add, fix, refactor, migrate, rename, remove, or update.",
	"- Do not use slashes, spaces, underscores, punctuation, or special characters.",
	"- Prefer concrete deliverables and specific nouns over broad words like changes or cleanup.",
] as const;

export interface BranchSlugEvidenceSection {
	heading: string;
	content: string;
	emptyText?: string;
	maxChars?: number;
}

export interface BranchSlugPromptInput {
	intro: string;
	inference?: string;
	evidenceSections: readonly BranchSlugEvidenceSection[];
}

export interface BranchSlugDerivationInput {
	cwd: string;
	prompt: string;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
}

export type BranchSlugModelResult =
	| { ok: true; baseSlug: string; source: "model" }
	| { ok: false; failure: SlugModelFailure; formattedFailure: string };

export function prepareRequestedBranchSlug(slug: string | undefined): RequestedBranchSlugResult {
	if (!slug) {
		return { kind: "absent" };
	}
	const requestedSlug = sanitizeBranchName(slug);
	if (!requestedSlug) {
		return { kind: "invalid_requested_slug", requestedSlug: slug };
	}
	return { kind: "slug", baseSlug: requestedSlug, source: "requested" };
}

export function buildBranchSlugPrompt(input: BranchSlugPromptInput): string {
	const lines: string[] = [input.intro];
	if (input.inference) {
		lines.push(input.inference);
	}
	lines.push("Rules:", ...BRANCH_SLUG_RULES, "");
	for (const section of input.evidenceSections) {
		const trimmedContent = section.content.trim();
		const content = trimmedContent.length > 0 ? trimmedContent : (section.emptyText ?? "");
		lines.push(`## ${section.heading}`, section.maxChars === undefined ? content : truncateText(content, section.maxChars));
	}
	return lines.join("\n");
}

export async function deriveBranchSlug(input: BranchSlugDerivationInput): Promise<BranchSlugModelResult> {
	const result = await deriveSlugWithModel({
		cwd: input.cwd,
		prompt: input.prompt,
		slugKind: "branch slug",
		normalizeOutput: sanitizeBranchName,
		exec: (command, args, options) => input.exec(command, args, options.cwd ?? input.cwd, options.timeout ?? SLUG_MODEL_TIMEOUT_MS),
	});
	if (result.ok) {
		return { ok: true, baseSlug: result.evidence.slug, source: "model" };
	}
	return { ok: false, failure: result.failure, formattedFailure: formatSlugModelFailure(result.failure) };
}
