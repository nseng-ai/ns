import { deduplicateOrderedStrings } from "@sdl/core/collections";
import { splitMarkdownFrontmatter } from "@sdl/core/markdown-frontmatter";
import { isLowercaseKebabCaseToken } from "@sdl/core/text-identifiers";

export interface SavedPlanMetadata {
	tags: readonly string[];
}

export type MergePlanTagsResult =
	| { type: "ok"; content: string; tags: readonly string[] }
	| { type: "invalid-tags"; message: string };

export type NormalizePlanTagsResult =
	| { type: "ok"; tags: readonly string[] }
	| { type: "invalid"; tag: string; message: string };

export function validatePlanTag(tag: string): string | undefined {
	const trimmed = tag.trim();
	if (trimmed.length === 0) {
		return "Tag must not be empty.";
	}
	if (trimmed !== tag) {
		return "Tag must not include leading or trailing whitespace.";
	}
	if (!isLowercaseKebabCaseToken(trimmed)) {
		return "Tag must be lowercase kebab-case using only a-z, 0-9, and single hyphens.";
	}
	return undefined;
}

export function normalizePlanTags(tags: readonly string[]): NormalizePlanTagsResult {
	for (const tag of tags) {
		const error = validatePlanTag(tag);
		if (error !== undefined) {
			return { type: "invalid", tag, message: error };
		}
	}
	return { type: "ok", tags: deduplicateOrderedStrings(tags) };
}

export function parseSavedPlanTags(content: string): readonly string[] {
	const parsed = parseFrontmatter(content);
	if (parsed === undefined) {
		return [];
	}
	const tags = parseTagsBlock(parsed.frontmatter);
	if (tags.type !== "ok") {
		return [];
	}
	return tags.tags;
}

export function mergeSavedPlanTags(content: string, suppliedTags: readonly string[]): MergePlanTagsResult {
	const normalizedSupplied = normalizePlanTags(suppliedTags);
	if (normalizedSupplied.type === "invalid") {
		return { type: "invalid-tags", message: `Invalid saved-plan tag \`${normalizedSupplied.tag}\`: ${normalizedSupplied.message}` };
	}
	const supplied = normalizedSupplied.tags;
	if (supplied.length === 0) {
		return { type: "ok", content, tags: parseSavedPlanTags(content) };
	}

	const parsed = parseFrontmatter(content);
	if (parsed === undefined) {
		const tagsBlock = formatTagsBlock(supplied);
		return { type: "ok", content: `---\n${tagsBlock}---\n\n${content}`, tags: supplied };
	}

	const existingTags = parseTagsBlock(parsed.frontmatter);
	if (existingTags.type === "invalid") {
		return { type: "invalid-tags", message: "Existing frontmatter has malformed tags metadata." };
	}

	const mergedTags = normalizePlanTags([...existingTags.tags, ...supplied]);
	if (mergedTags.type === "invalid") {
		return { type: "invalid-tags", message: "Existing frontmatter has malformed tags metadata." };
	}
	const frontmatter = replaceOrInsertTagsBlock(parsed.frontmatter, formatTagsBlock(mergedTags.tags));
	return {
		type: "ok",
		content: `---\n${frontmatter}---${parsed.body}`,
		tags: mergedTags.tags,
	};
}

interface FrontmatterParseResult {
	frontmatter: string;
	body: string;
}

type TagsParseResult = { type: "ok"; tags: readonly string[] } | { type: "invalid" };

function parseFrontmatter(content: string): FrontmatterParseResult | undefined {
	const split = splitMarkdownFrontmatter(content);
	if (split.type !== "found") {
		return undefined;
	}
	const closingLine = split.block.linesWithEndings[split.block.closingIndex] ?? "---";
	const closingLineEnding = closingLine.endsWith("\r\n") || closingLine.endsWith("\n") ? "\n" : "";
	return {
		frontmatter: normalizeMarkdownLineEndings(split.block.frontmatterText),
		body: `${closingLineEnding}${normalizeMarkdownLineEndings(split.block.body)}`,
	};
}

// Saved-plan tags intentionally support a tiny frontmatter subset instead of full YAML:
// a lowercase kebab-case string list under `tags:`.
function parseTagsBlock(frontmatter: string): TagsParseResult {
	const lines = frontmatter.split("\n");
	const malformedTagsLine = lines.find((line) => line.trim().startsWith("tags:") && line.trim() !== "tags:");
	if (malformedTagsLine !== undefined) {
		return { type: "invalid" };
	}
	const tagsLineIndex = lines.findIndex((line) => line.trim() === "tags:");
	if (tagsLineIndex === -1) {
		return { type: "ok", tags: [] };
	}

	const tags: string[] = [];
	for (let index = tagsLineIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.trim().length === 0) {
			continue;
		}
		if (!line.startsWith("  - ") && !line.startsWith("    - ")) {
			break;
		}
		const tag = line.replace(/^\s*-\s*/, "");
		tags.push(tag);
	}

	const normalized = normalizePlanTags(tags);
	if (normalized.type === "invalid") {
		return { type: "invalid" };
	}
	return normalized;
}

function replaceOrInsertTagsBlock(frontmatter: string, tagsBlock: string): string {
	const lines = frontmatter.split("\n");
	const tagsLineIndex = lines.findIndex((line) => line.trim() === "tags:");
	if (tagsLineIndex === -1) {
		return `${frontmatter}${frontmatter.endsWith("\n") ? "" : "\n"}${tagsBlock}`;
	}

	let endIndex = tagsLineIndex + 1;
	while (endIndex < lines.length) {
		const line = lines[endIndex] ?? "";
		if (line.trim().length === 0 || line.startsWith("  - ") || line.startsWith("    - ")) {
			endIndex += 1;
			continue;
		}
		break;
	}

	const updatedFrontmatter = [...lines.slice(0, tagsLineIndex), ...tagsBlock.trimEnd().split("\n"), ...lines.slice(endIndex)].join("\n");
	return updatedFrontmatter.endsWith("\n") ? updatedFrontmatter : `${updatedFrontmatter}\n`;
}

function formatTagsBlock(tags: readonly string[]): string {
	return `tags:\n${tags.map((tag) => `  - ${tag}`).join("\n")}\n`;
}

function normalizeMarkdownLineEndings(text: string): string {
	return text.replaceAll("\r\n", "\n");
}
