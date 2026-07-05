/**
 * Domain model for the `/stack:view` panel plus the pure merge-readiness
 * derivation. This module is intentionally dependency-light: it holds only
 * plain-data shapes and pure transformations so downstream data/render modules
 * can depend on it without pulling in exec or GraphQL concerns.
 */

import type { GithubRepositoryIdentity } from "@nseng-ai/capability-kit/github";
import { z } from "zod";

/** Review-thread resolution counts for a single PR. */
export const stackViewPrThreadsSchema = z.object({
	resolved: z.number(),
	total: z.number(),
});

export type StackViewPrThreads = z.infer<typeof stackViewPrThreadsSchema>;

/** CI check-run counts for a single PR. */
export const stackViewPrChecksSchema = z.object({
	passing: z.number(),
	failing: z.number(),
	pending: z.number(),
	total: z.number(),
});

export type StackViewPrChecks = z.infer<typeof stackViewPrChecksSchema>;

/** Which rollup bucket a named check landed in. Upstream `unknown` is folded into `pending`. */
export type StackViewCheckBucket = "passing" | "failing" | "pending";

/** One named CI check for the detail pane. */
export const stackViewCheckEntrySchema = z.object({
	name: z.string(),
	workflowName: z.string().nullable(),
	bucket: z.enum(["passing", "failing", "pending"]),
	// Additive fields: old persisted snapshots omit these, so default them.
	status: z.string().nullable().default(null),
	conclusion: z.string().nullable().default(null),
	detailsUrl: z.string().nullable().default(null),
	identity: z.string().nullable().default(null),
});

export type StackViewCheckEntry = z.infer<typeof stackViewCheckEntrySchema>;

/** One fetched review-thread comment for the detail pane and summaries. */
export const stackViewThreadCommentSchema = z.object({
	id: z.string(),
	author: z.string().nullable(),
	body: z.string(),
	createdAt: z.string().nullable(),
});

export type StackViewThreadComment = z.infer<typeof stackViewThreadCommentSchema>;

/** One unresolved review thread for the detail pane. `line` is null for file-level comments. */
export const stackViewThreadDetailSchema = z.object({
	path: z.string(),
	line: z.number().nullable(),
	author: z.string().nullable(),
	// Additive fields: old persisted snapshots omit these, so default them.
	id: z.string().nullable().default(null),
	comments: z.array(stackViewThreadCommentSchema).default([]),
	lastCommentId: z.string().nullable().default(null),
	totalComments: z.number().default(0),
});

export type StackViewThreadDetail = z.infer<typeof stackViewThreadDetailSchema>;

/**
 * Derived merge-readiness of a stack row, in priority order:
 * no PR, draft, checks failing, unresolved review threads, otherwise ready.
 */
export type StackViewPrStatus = "draft" | "checks-failing" | "unresolved" | "ready" | "no-pr";

export const stackViewPrStatusSchema = z.enum([
	"draft",
	"checks-failing",
	"unresolved",
	"ready",
	"no-pr",
]);

/** One row of the stack view: a branch and its associated PR (if any). */
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
});

export type StackViewPr = z.infer<typeof stackViewPrSchema>;

/**
 * The full stack-view model. `prs` is ordered top-of-stack first; the trunk is
 * carried as a name and rendered separately from the PR rows.
 */
export interface StackViewModel extends GithubRepositoryIdentity {
	trunk: string;
	currentBranch: string;
	prs: StackViewPr[];
	objectivesBySlug: Map<string, number[]>;
}

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

/** Narrow input for {@link deriveStatus}: only the fields the derivation reads. */
export interface StackViewStatusInput {
	number: number | null;
	isDraft: boolean;
	checks: Pick<StackViewPrChecks, "failing">;
	threads: StackViewPrThreads;
}

/**
 * Pure merge-readiness derivation. Priority order: no PR wins, then draft, then
 * any failing check, then any unresolved review thread, otherwise ready.
 */
export function deriveStatus(input: StackViewStatusInput): StackViewPrStatus {
	if (input.number === null) return "no-pr";
	if (input.isDraft) return "draft";
	if (input.checks.failing > 0) return "checks-failing";
	if (input.threads.total - input.threads.resolved > 0) return "unresolved";
	return "ready";
}
