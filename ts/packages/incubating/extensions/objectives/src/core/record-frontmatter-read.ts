import type { ObjectiveRecordFrontmatter } from "./record-frontmatter.ts";
import type { ObjectiveRecordDocumentReadResult } from "./storage.ts";

export interface ParsedObjectiveFrontmatterRead {
	frontmatter: ObjectiveRecordFrontmatter | null;
	malformed?: string;
}

export function readParsedObjectiveFrontmatter(
	read: ObjectiveRecordDocumentReadResult,
): ParsedObjectiveFrontmatterRead {
	if (read.type !== "ok") return { frontmatter: null };
	const parse = read.document.frontmatter;
	if (parse === undefined) return { frontmatter: null };
	if (parse.type === "malformed") return { frontmatter: null, malformed: parse.message };
	return { frontmatter: parse.frontmatter };
}
