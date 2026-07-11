import { z } from "zod";

import type {
	StackViewCheckEntry,
	StackViewPr,
	StackViewPrChecks,
	StackViewPrStatus,
	StackViewPrThreads,
	StackViewThreadComment,
	StackViewThreadDetail,
} from "./types.ts";

export const stackViewPrThreadsSchema = z.object({
	resolved: z.number(),
	total: z.number(),
}) satisfies z.ZodType<StackViewPrThreads>;

export const stackViewPrChecksSchema = z.object({
	passing: z.number(),
	failing: z.number(),
	pending: z.number(),
	// Additive field: old persisted snapshots omit it, so default it.
	cancelled: z.number().default(0),
	total: z.number(),
}) satisfies z.ZodType<StackViewPrChecks>;

export const stackViewCheckEntrySchema = z.object({
	name: z.string(),
	workflowName: z.string().nullable(),
	bucket: z.enum(["passing", "failing", "pending", "cancelled"]),
	// Additive fields: old persisted snapshots omit these, so default them.
	status: z.string().nullable().default(null),
	conclusion: z.string().nullable().default(null),
	detailsUrl: z.string().nullable().default(null),
	identity: z.string().nullable().default(null),
}) satisfies z.ZodType<StackViewCheckEntry>;

export const stackViewThreadCommentSchema = z.object({
	id: z.string(),
	author: z.string().nullable(),
	body: z.string(),
	createdAt: z.string().nullable(),
}) satisfies z.ZodType<StackViewThreadComment>;

export const stackViewThreadDetailSchema = z.object({
	path: z.string(),
	line: z.number().nullable(),
	author: z.string().nullable(),
	// Additive fields: old persisted snapshots omit these, so default them.
	id: z.string().nullable().default(null),
	comments: z.array(stackViewThreadCommentSchema).default([]),
	lastCommentId: z.string().nullable().default(null),
	totalComments: z.number().default(0),
}) satisfies z.ZodType<StackViewThreadDetail>;

export const stackViewPrStatusSchema = z.enum([
	"draft",
	"checks-failing",
	"unresolved",
	"ready",
	"no-pr",
]) satisfies z.ZodType<StackViewPrStatus>;

export const stackViewPrSchema = z.object({
	branch: z.string(),
	parentBranch: z.string(),
	number: z.number().nullable(),
	title: z.string(),
	url: z.string(),
	graphiteUrl: z.string(),
	isDraft: z.boolean(),
	body: z.string(),
	threads: stackViewPrThreadsSchema,
	checks: stackViewPrChecksSchema,
	checkEntries: z.array(stackViewCheckEntrySchema),
	unresolvedThreads: z.array(stackViewThreadDetailSchema),
	status: stackViewPrStatusSchema,
	objectiveSlugs: z.array(z.string()),
}) satisfies z.ZodType<StackViewPr>;

/** JSON-cloneable snapshot shape persisted in custom-message details. */
export const serializedStackViewModelSchema = z.object({
	trunk: z.string(),
	currentBranch: z.string(),
	owner: z.string(),
	repo: z.string(),
	prs: z.array(stackViewPrSchema),
	objectivesBySlug: z.array(z.tuple([z.string(), z.array(z.number())])),
});

export type SerializedStackViewModel = z.infer<typeof serializedStackViewModelSchema>;

export const stackViewSnapshotDetailsSchema = z.object({ model: serializedStackViewModelSchema });
