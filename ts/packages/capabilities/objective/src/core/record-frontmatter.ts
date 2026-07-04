import { splitMarkdownFrontmatter } from "@ns/core/markdown-frontmatter";
import { formatErrorMessage, formatZodError } from "@ns/core/primitives";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Record Frontmatter: the optional YAML block at the top of an Objective record's
 * `objective.md` (ADR 0025). The schema is closed — exactly `blocked` and `edges` —
 * and this reader only distinguishes well-formed frontmatter from none. Structural
 * violations (dangling slugs, missing mirrors, empty annotations, duplicate pairs)
 * are the edge/blocked linter's job, not this reader's.
 */

export const objectiveRecordEdgeSchema = z.strictObject({
	objective: z.string(),
	annotation: z.string(),
});

export const objectiveRecordFrontmatterSchema = z.strictObject({
	blocked: z.string().nullable().default(null),
	edges: z.array(objectiveRecordEdgeSchema).default([]),
});

export const objectiveRecordFrontmatterParseSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("frontmatter"), frontmatter: objectiveRecordFrontmatterSchema }),
	z.strictObject({ type: z.literal("malformed"), message: z.string() }),
]);

export type ObjectiveRecordEdge = z.infer<typeof objectiveRecordEdgeSchema>;
export type ObjectiveRecordFrontmatter = z.infer<typeof objectiveRecordFrontmatterSchema>;

/**
 * Outcome of parsing a fenced frontmatter block. "No frontmatter at all" is modeled
 * as key omission on `ObjectiveRecordDocument`, not as a variant here, so consumers
 * that only care about presence can use the document's optional key directly.
 */
export type ObjectiveRecordFrontmatterParse = z.infer<typeof objectiveRecordFrontmatterParseSchema>;

export interface ObjectiveRecordDocument {
	/** Omitted when the record has no frontmatter fence at all. */
	frontmatter?: ObjectiveRecordFrontmatterParse;
	/**
	 * Record content with any well-delimited frontmatter block removed. For records
	 * without frontmatter this is the full content unchanged; heading lints and other
	 * content-shaped readers must operate on this, never on the raw file text.
	 */
	body: string;
}

/**
 * Split an `objective.md` into Record Frontmatter and body. Frontmatter-cheap by
 * design: only the fenced block is parsed; the body is never interpreted.
 *
 * Malformed handling is deliberately minimal (the linter row hardens it):
 * - An opening fence with no closing fence is malformed and strips nothing, so
 *   readers still see every real line of content.
 * - A well-delimited block that is not valid YAML or not the closed
 *   `blocked`/`edges` schema is malformed; the block is still stripped from the
 *   body so fence and YAML lines are never treated as record content.
 */
export function splitObjectiveRecordDocument(content: string): ObjectiveRecordDocument {
	const split = splitMarkdownFrontmatter(content);
	if (split.type === "not_found") return { body: content };
	if (split.type === "missing_closing_fence") {
		return malformedFrontmatterDocument("frontmatter opening fence has no closing fence", content);
	}

	const body = split.block.body;
	let parsed: unknown;
	try {
		parsed = parse(split.block.frontmatterText);
	} catch (error) {
		return malformedFrontmatterDocument(
			`frontmatter is not valid YAML: ${formatErrorMessage(error)}`,
			body,
		);
	}

	const validated = objectiveRecordFrontmatterSchema.safeParse(parsed ?? {});
	if (!validated.success) {
		return malformedFrontmatterDocument(
			`frontmatter does not match the blocked/edges schema: ${formatZodError(validated.error)}`,
			body,
		);
	}

	return {
		frontmatter: {
			type: "frontmatter",
			frontmatter: validated.data,
		},
		body,
	};
}

function malformedFrontmatterDocument(message: string, body: string): ObjectiveRecordDocument {
	return { frontmatter: { type: "malformed", message }, body };
}
