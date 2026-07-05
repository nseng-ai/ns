import { optionalEntry } from "@nseng-ai/core/primitives";
import { z } from "zod";

import type { GithubPrSummary } from "../api.ts";

export const nullableIntSchema = z.int().nullable();
export const nullableStringSchema = z.string().nullable();

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

interface PrTargetLookup {
	readonly pr: GithubPrSummary | null;
	readonly branch: string | null;
	readonly prNumber?: number;
}

interface BuildPrTargetPayloadOptions extends PrTargetLookup {
	readonly headRefOid: "include" | "omit";
}

function buildPrTargetPayload(options: BuildPrTargetPayloadOptions): PrTargetPayload {
	const payload = {
		kind: "github-pr",
		pr_number: options.pr?.number ?? options.prNumber ?? null,
		branch: options.branch,
		title: options.pr?.title ?? null,
		url: options.pr?.url ?? null,
		head_ref_name: options.pr?.headRefName ?? null,
		base_ref_name: options.pr?.baseRefName ?? null,
	} satisfies Omit<PrTargetPayload, "head_ref_oid">;
	if (options.headRefOid === "omit") return payload;
	return { ...payload, head_ref_oid: options.pr?.headRefOid ?? null };
}

export function buildDownloadFeedbackTargetPayload(options: PrTargetLookup): PrTargetPayload {
	return buildPrTargetPayload({
		pr: options.pr,
		branch: options.branch ?? options.pr?.headRefName ?? null,
		...prNumberPayloadOption(options),
		headRefOid: "omit",
	});
}

export function buildPrChecksTargetPayload(options: PrTargetLookup): PrTargetPayload {
	return buildPrTargetPayload({
		pr: options.pr,
		branch: options.branch,
		...prNumberPayloadOption(options),
		headRefOid: "include",
	});
}

function prNumberPayloadOption(
	options: PrTargetLookup,
): Pick<BuildPrTargetPayloadOptions, "prNumber"> {
	return optionalEntry("prNumber", options.prNumber);
}
