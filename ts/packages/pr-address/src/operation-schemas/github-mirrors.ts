import { z } from "zod";

import { nullableIntSchema, prReviewStateSchema } from "./shared.ts";

// --- GitHub / git dataclass mirrors (open objects) ---------------------------

export const prReviewSchema = z.looseObject({
	id: z.string(),
	author: z.string(),
	body: z.string(),
	state: prReviewStateSchema,
	submitted_at: z.string(),
});

export const prReviewCommentSchema = z.looseObject({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	created_at: z.string(),
	start_line: nullableIntSchema.optional(),
});

export const prReviewThreadSchema = z.looseObject({
	id: z.string(),
	path: z.string(),
	line: nullableIntSchema,
	is_resolved: z.boolean(),
	is_outdated: z.boolean(),
	comments: z.array(prReviewCommentSchema),
	start_line: nullableIntSchema.optional(),
});

export const prDiscussionCommentSchema = z.looseObject({
	id: z.int(),
	body: z.string(),
	author: z.string(),
	url: z.string(),
});

export const reactionSchema = z.looseObject({
	id: z.int(),
	comment_id: z.int(),
	content: z.string(),
});

export const restructuredFileSchema = z.looseObject({
	status: z.string(),
	old_path: z.string(),
	new_path: z.string(),
	similarity: z.int(),
});
