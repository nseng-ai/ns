export interface SavedPlanMetadata {
	tags: readonly string[];
}

export type MergePlanTagsResult =
	| { type: "ok"; content: string; tags: readonly string[] }
	| { type: "invalid-tags"; message: string };

const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validatePlanTag(tag: string): string | undefined {
	const trimmed = tag.trim();
	if (trimmed.length === 0) {
		return "Tag must not be empty.";
	}
	if (trimmed !== tag) {
		return "Tag must not include leading or trailing whitespace.";
	}
	if (!TAG_PATTERN.test(trimmed)) {
		return "Tag must be lowercase kebab-case using only a-z, 0-9, and single hyphens.";
	}
	return undefined;
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
	const supplied = dedupeTags(suppliedTags);
	for (const tag of supplied) {
		const error = validatePlanTag(tag);
		if (error !== undefined) {
			return { type: "invalid-tags", message: `Invalid saved-plan tag \`${tag}\`: ${error}` };
		}
	}
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

	const mergedTags = dedupeTags([...existingTags.tags, ...supplied]);
	const frontmatter = replaceOrInsertTagsBlock(parsed.frontmatter, formatTagsBlock(mergedTags));
	return {
		type: "ok",
		content: `---\n${frontmatter}---${parsed.body}`,
		tags: mergedTags,
	};
}

interface FrontmatterParseResult {
	frontmatter: string;
	body: string;
}

type TagsParseResult = { type: "ok"; tags: readonly string[] } | { type: "invalid" };

function parseFrontmatter(content: string): FrontmatterParseResult | undefined {
	if (!content.startsWith("---\n") && content !== "---") {
		return undefined;
	}
	const closingIndex = content.indexOf("\n---", 4);
	if (closingIndex === -1) {
		return undefined;
	}
	const afterClosingIndex = closingIndex + "\n---".length;
	const closingSuffix = content.slice(afterClosingIndex, afterClosingIndex + 1);
	if (closingSuffix !== "" && closingSuffix !== "\n" && closingSuffix !== "\r") {
		return undefined;
	}
	return {
		frontmatter: content.slice(4, closingIndex + 1),
		body: content.slice(afterClosingIndex),
	};
}

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
		if (validatePlanTag(tag) !== undefined) {
			return { type: "invalid" };
		}
		tags.push(tag);
	}

	return { type: "ok", tags: dedupeTags(tags) };
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

	const updated = [...lines.slice(0, tagsLineIndex), ...tagsBlock.trimEnd().split("\n"), ...lines.slice(endIndex)].join("\n");
	return updated.endsWith("\n") ? updated : `${updated}\n`;
}

function formatTagsBlock(tags: readonly string[]): string {
	return `tags:\n${tags.map((tag) => `  - ${tag}`).join("\n")}\n`;
}

function dedupeTags(tags: readonly string[]): readonly string[] {
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const tag of tags) {
		const trimmed = tag.trim();
		if (seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		deduped.push(trimmed);
	}
	return deduped;
}
