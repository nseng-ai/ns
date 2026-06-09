import { deriveSlugWithModel, type SlugModelEvidence } from "@asdl/plans";
import { formatOutputSection } from "../command-runtime.ts";
import { parseFlatHandoffSlug } from "./identity.ts";
import type { ExtensionAPI } from "./runtime-types.ts";

const MAX_ERROR_CHARS = 4_000;
const MAX_HANDOFF_SLUG_WORDS = 8;
const GENERIC_ONLY_WORDS = new Set(["handoff", "artifact", "session", "continue", "follow", "up", "work", "task"]);

export const MAX_HANDOFF_CONTENT_CHARS = 32_000;
export type HandoffContentSlugEvidence = SlugModelEvidence;

export async function deriveHandoffContentSlug(
	host: Pick<ExtensionAPI, "exec">,
	input: { content: string; cwd: string; signal?: AbortSignal | undefined },
): Promise<HandoffContentSlugEvidence> {
	const prompt = buildHandoffContentSlugPrompt(input.content);
	const result = await deriveSlugWithModel({
		cwd: input.cwd,
		prompt,
		...(input.signal === undefined ? {} : { signal: input.signal }),
		slugKind: "handoff artifact slug",
		normalizeOutput: normalizeHandoffContentSlugOutput,
		exec: (command, args, options) => host.exec(command, args, options),
	});
	if (!result.ok) {
		throw handoffSlugDerivationFailed(result.failure.lines);
	}

	const { slug, rawOutput } = result.evidence;
	const slugError = validateHandoffContentSlug(slug);
	if (slugError !== undefined) {
		throw handoffSlugDerivationFailed([
			"Pi slug model output normalized to an invalid handoff artifact slug.",
			`Normalized slug: ${slug}`,
			`Reason: ${slugError}`,
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	return result.evidence;
}

export function buildHandoffContentSlugPrompt(content: string): string {
	return [
		"Generate the handoff artifact entry slug for the final Markdown handoff content below.",
		"Use only the final Markdown handoff content.",
		"Do not use the original request/focus, current branch, filename, path, dates, random IDs, or generic-only names.",
		"Return exactly one slug and no prose.",
		"Rules:",
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Prefer a concise 3–8 word slug.",
		"- Prefer the concrete future continuation action and subject from the artifact body.",
		"- Avoid raw request preambles such as i-want-to-handoff or please-create-a-handoff.",
		"- Avoid generic-only slugs such as handoff, session, continue, follow-up, work, task, or combinations made only of those words.",
		"",
		"## Final Markdown handoff content",
		truncateHandoffContentForSlug(content.trim() || "(empty handoff content)"),
	].join("\n");
}

export function normalizeHandoffContentSlugOutput(value: string): string | undefined {
	const firstLine = firstNonEmptyModelOutputLine(value);
	if (firstLine === undefined) {
		return undefined;
	}

	const slug = firstLine
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	const withoutSuffix = removeGenericHandoffSuffix(slug);
	if (withoutSuffix.length === 0) {
		return undefined;
	}

	const repaired = withoutSuffix.split("-").filter(Boolean).slice(0, MAX_HANDOFF_SLUG_WORDS).join("-");
	return repaired.length > 0 ? repaired : undefined;
}

export function truncateHandoffContentForSlug(content: string): string {
	if (content.length <= MAX_HANDOFF_CONTENT_CHARS) {
		return content;
	}
	return `${content.slice(0, MAX_HANDOFF_CONTENT_CHARS)}\n\n[Handoff content truncated for slug generation]`;
}

export function validateHandoffContentSlug(slug: string): string | undefined {
	const parsedSlug = parseFlatHandoffSlug(slug, "handoff artifact slug");
	if (parsedSlug.type === "invalid") {
		return parsedSlug.message;
	}

	const words = parsedSlug.slug.split("-").filter(Boolean);
	if (words.length > 0 && words.every((word) => GENERIC_ONLY_WORDS.has(word))) {
		return "handoff artifact slug must include a specific continuation action or subject, not only generic handoff words.";
	}

	return undefined;
}

function firstNonEmptyModelOutputLine(value: string): string | undefined {
	return value
		.replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?|```/g, ""))
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

function removeGenericHandoffSuffix(slug: string): string {
	const suffixes = ["-handoff-artifact", "-handoff", "-session"];
	let current = slug;
	let removed = true;
	while (removed) {
		removed = false;
		for (const suffix of suffixes) {
			if (current.endsWith(suffix)) {
				const candidate = current.slice(0, -suffix.length).replace(/^-|-$/g, "");
				if (candidate.length > 0) {
					current = candidate;
					removed = true;
				}
			}
		}
	}
	return current;
}

function handoffSlugDerivationFailed(lines: readonly string[]): Error {
	return new Error([
		"Failed to derive handoff slug from final artifact content.",
		...lines,
		"No continuation-focus or deterministic fallback was attempted.",
	].join("\n"));
}
