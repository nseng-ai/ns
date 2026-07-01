import { z } from "zod";

import type { GithubPrSummary } from "../api.ts";

const nullableIntSchema = z.int().nullable();
const nullableStringSchema = z.string().nullable();

export const prTargetPayloadSchema = z.object({
	kind: z.literal("github-pr"),
	pr_number: nullableIntSchema,
	branch: nullableStringSchema,
	title: nullableStringSchema,
	url: nullableStringSchema,
	head_ref_name: nullableStringSchema,
	base_ref_name: nullableStringSchema,
	head_ref_oid: nullableStringSchema.optional(),
});

export type PrTargetPayload = z.output<typeof prTargetPayloadSchema>;

export interface BuildPrTargetPayloadOptions {
	readonly pr: GithubPrSummary | null;
	readonly branch: string | null;
	readonly prNumber?: number;
	readonly includeHeadRefOid?: boolean;
	readonly fallbackBranchToHead?: boolean;
}

export function buildPrTargetPayload(options: BuildPrTargetPayloadOptions): PrTargetPayload {
	const payload = {
		kind: "github-pr",
		pr_number: options.pr?.number ?? options.prNumber ?? null,
		branch:
			options.branch ?? (options.fallbackBranchToHead ? (options.pr?.headRefName ?? null) : null),
		title: options.pr?.title ?? null,
		url: options.pr?.url ?? null,
		head_ref_name: options.pr?.headRefName ?? null,
		base_ref_name: options.pr?.baseRefName ?? null,
	} satisfies Omit<PrTargetPayload, "head_ref_oid">;
	if (options.includeHeadRefOid !== true) return payload;
	return { ...payload, head_ref_oid: options.pr?.headRefOid ?? null };
}
