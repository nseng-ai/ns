import { MODEL_OPERATION_IDS, resolveModelOperation } from "@nseng-ai/capability-kit/model-policy";

import { environmentOptions, type ReviewsRuntime } from "../core/context.ts";
import type { ReviewResult } from "../core/failures.ts";
import {
	reviewAggregationRequestSchema,
	reviewAggregationResultSchema,
	sourceAttributedFindingKey,
	type ResolvedReviewCluster,
	type ReviewAggregationConstraint,
	type ReviewAggregationProposalCluster,
	type ReviewAggregationRequest,
	type ReviewAggregationResult,
	type SourceAttributedFinding,
} from "../core/models.ts";
import { resolveReviewsModelReference } from "../core/review-model-reference.ts";
import { loadProjectConfigFromContext } from "./review-run.ts";

export async function aggregateReviewRoster(
	ctx: ReviewsRuntime,
	request: ReviewAggregationRequest,
): Promise<ReviewResult<ReviewAggregationResult>> {
	const parsed = reviewAggregationRequestSchema.safeParse(request);
	if (!parsed.success) {
		return aggregationFailure(
			"review-aggregation-invalid-request",
			parsed.error.issues[0]?.message ?? "Invalid aggregation request.",
		);
	}
	const roster = parsed.data.rosterResult;
	const rosterIndex = buildRosterIndex(roster.findings);
	if (!rosterIndex.ok) return rosterIndex;
	if (
		parsed.data.priorResult !== undefined &&
		JSON.stringify(parsed.data.priorResult.rosterResult) !== JSON.stringify(roster)
	) {
		return aggregationFailure(
			"review-aggregation-invalid-prior-result",
			"priorResult must belong to the exact same roster result.",
		);
	}
	const constraints = validateConstraints(parsed.data.constraints, rosterIndex.value);
	if (!constraints.ok) return constraints;
	const decisions = validateDecisionReferences(parsed.data.decisions.clusters, rosterIndex.value);
	if (!decisions.ok) return decisions;

	const config = await loadProjectConfigFromContext(ctx);
	if (!config.ok) {
		return aggregationFailure("review-aggregation-model-resolution-failed", config.error.message);
	}
	const modelOperation = resolveModelOperation(
		config.value.modelPolicy,
		MODEL_OPERATION_IDS.reviewsAggregate,
	);
	if (!modelOperation.ok) {
		return aggregationFailure(
			"review-aggregation-model-resolution-failed",
			modelOperation.error.message,
		);
	}
	const supportedModel = resolveReviewsModelReference(modelOperation.value.modelRef);
	if (!supportedModel.ok) {
		return aggregationFailure(
			"review-aggregation-model-resolution-failed",
			supportedModel.error.message,
		);
	}

	const response = await ctx.reviewAggregationRunner.runAggregation(
		{
			model: supportedModel.value.reference,
			rosterResult: roster,
			...(parsed.data.priorResult === undefined ? {} : { priorResult: parsed.data.priorResult }),
			constraints: parsed.data.constraints,
		},
		environmentOptions(ctx.runScope),
	);
	if (!response.ok) return response;

	const normalized = normalizeAndValidatePartition(
		response.value.payload.clusters,
		roster.findings,
		rosterIndex.value,
		parsed.data.constraints,
	);
	if (!normalized.ok) return normalized;
	const applied = applyDecisions(normalized.value, parsed.data.decisions, rosterIndex.value);
	if (!applied.ok) return applied;
	const findingDispositions = applied.value.flatMap((cluster) =>
		cluster.findings.map((finding) => ({
			finding,
			disposition: cluster.disposition,
			authority: cluster.authority,
		})),
	);
	const confirmed = applied.value.filter(
		(cluster) => cluster.authority === "engineer-confirmed",
	).length;
	const completeness =
		confirmed === 0
			? "all-proposed"
			: confirmed === applied.value.length
				? "fully-confirmed"
				: "partially-confirmed";
	const result = reviewAggregationResultSchema.safeParse({
		rosterResult: roster,
		modelProfile: modelOperation.value.profile,
		model: supportedModel.value.reference,
		clusters: applied.value,
		findingDispositions,
		completeness,
	});
	if (!result.success) {
		return aggregationFailure(
			"review-aggregation-invalid-accounting",
			`Failed to build complete aggregation accounting: ${result.error.message}`,
		);
	}
	return { ok: true, value: result.data };
}

interface RosterIndex {
	readonly byKey: ReadonlyMap<
		string,
		{ readonly finding: SourceAttributedFinding; readonly index: number }
	>;
}

function buildRosterIndex(findings: readonly SourceAttributedFinding[]): ReviewResult<RosterIndex> {
	const byKey = new Map<string, { finding: SourceAttributedFinding; index: number }>();
	for (const [index, finding] of findings.entries()) {
		const key = sourceAttributedFindingKey(finding);
		if (byKey.has(key)) {
			return aggregationFailure(
				"review-aggregation-invalid-request",
				"Roster contains findings with duplicate complete references.",
			);
		}
		byKey.set(key, { finding, index });
	}
	return { ok: true, value: { byKey } };
}

function validateConstraints(
	constraints: ReviewAggregationConstraint,
	index: RosterIndex,
): ReviewResult<void> {
	const parents = new Map<string, string>();
	function root(key: string): string {
		const parent = parents.get(key);
		if (parent === undefined || parent === key) return key;
		const resolved = root(parent);
		parents.set(key, resolved);
		return resolved;
	}
	for (const finding of index.byKey.keys()) parents.set(finding, finding);
	for (const group of constraints.mustGroup) {
		const keys = group.map(sourceAttributedFindingKey);
		const unknown = keys.find((key) => !index.byKey.has(key));
		if (unknown !== undefined)
			return invalidConstraints("mustGroup references an unknown finding.");
		if (new Set(keys).size !== keys.length)
			return invalidConstraints("mustGroup cannot repeat a finding.");
		const first = root(keys[0]!);
		for (const key of keys.slice(1)) parents.set(root(key), first);
	}
	for (const pair of constraints.mustSeparate) {
		const [left, right] = pair.map(sourceAttributedFindingKey);
		if (!index.byKey.has(left!) || !index.byKey.has(right!))
			return invalidConstraints("mustSeparate references an unknown finding.");
		if (left === right || root(left!) === root(right!))
			return invalidConstraints("mustGroup and mustSeparate constraints contradict each other.");
	}
	return { ok: true, value: undefined };
}

function validateDecisionReferences(
	decisions: readonly { readonly findings: readonly SourceAttributedFinding[] }[],
	index: RosterIndex,
): ReviewResult<void> {
	const seen = new Set<string>();
	for (const decision of decisions) {
		const normalized = normalizedMembershipKey(decision.findings, index);
		if (!normalized.ok) {
			return aggregationFailure(
				"review-aggregation-invalid-request",
				"A cluster decision references an unknown or repeated finding.",
			);
		}
		if (seen.has(normalized.value)) {
			return aggregationFailure(
				"review-aggregation-invalid-request",
				"Cluster decisions must target distinct member sets.",
			);
		}
		seen.add(normalized.value);
	}
	return { ok: true, value: undefined };
}

function normalizeAndValidatePartition(
	clusters: readonly ReviewAggregationProposalCluster[],
	rosterFindings: readonly SourceAttributedFinding[],
	index: RosterIndex,
	constraints: ReviewAggregationConstraint,
): ReviewResult<ReviewAggregationProposalCluster[]> {
	const seen = new Set<string>();
	const normalized: { cluster: ReviewAggregationProposalCluster; first: number }[] = [];
	for (const cluster of clusters) {
		const members: { finding: SourceAttributedFinding; index: number; key: string }[] = [];
		for (const finding of cluster.findings) {
			const key = sourceAttributedFindingKey(finding);
			const authoritative = index.byKey.get(key);
			if (authoritative === undefined || seen.has(key)) {
				return invalidAccounting(
					authoritative === undefined
						? "Aggregation output contains an invented or altered finding."
						: "Aggregation output contains a finding more than once.",
				);
			}
			seen.add(key);
			members.push({ finding: authoritative.finding, index: authoritative.index, key });
		}
		members.sort((left, right) => left.index - right.index);
		normalized.push({
			cluster: { ...cluster, findings: members.map((member) => member.finding) },
			first: members[0]!.index,
		});
	}
	if (seen.size !== rosterFindings.length) {
		return invalidAccounting(
			"Aggregation output does not include every roster finding exactly once.",
		);
	}
	normalized.sort((left, right) => left.first - right.first);
	const result = normalized.map((entry) => entry.cluster);
	const membershipByFinding = new Map<string, number>();
	for (const [clusterIndex, cluster] of result.entries())
		for (const finding of cluster.findings)
			membershipByFinding.set(sourceAttributedFindingKey(finding), clusterIndex);
	for (const group of constraints.mustGroup) {
		const memberships = new Set(
			group.map((finding) => membershipByFinding.get(sourceAttributedFindingKey(finding))),
		);
		if (memberships.size !== 1) return invalidConstraints("Aggregation output violates mustGroup.");
	}
	for (const [left, right] of constraints.mustSeparate) {
		if (
			membershipByFinding.get(sourceAttributedFindingKey(left)) ===
			membershipByFinding.get(sourceAttributedFindingKey(right))
		)
			return invalidConstraints("Aggregation output violates mustSeparate.");
	}
	return { ok: true, value: result };
}

function applyDecisions(
	clusters: readonly ReviewAggregationProposalCluster[],
	decisions: ReviewAggregationRequest["decisions"],
	index: RosterIndex,
): ReviewResult<ResolvedReviewCluster[]> {
	const explicit = new Map(
		decisions.clusters.map((decision) => {
			const key = normalizedMembershipKey(decision.findings, index);
			if (!key.ok) throw new Error("Decision references were validated before model invocation.");
			return [key.value, decision.disposition] as const;
		}),
	);
	const resolved: ResolvedReviewCluster[] = [];
	for (const cluster of clusters) {
		const key = normalizedMembershipKey(cluster.findings, index);
		if (!key.ok) throw new Error("Proposal membership was validated before decisions.");
		const override = explicit.get(key.value);
		if (override !== undefined) explicit.delete(key.value);
		resolved.push({
			...cluster,
			disposition: override ?? cluster.disposition,
			authority:
				override !== undefined ||
				(decisions.bulkConfirmUnconflicted && !cluster.recommendationConflict)
					? "engineer-confirmed"
					: "model-proposed",
		});
	}
	if (explicit.size > 0) {
		return aggregationFailure(
			"review-aggregation-invalid-request",
			"A cluster decision does not match a complete cluster in the current proposal.",
		);
	}
	return { ok: true, value: resolved };
}

function normalizedMembershipKey(
	findings: readonly SourceAttributedFinding[],
	index: RosterIndex,
): ReviewResult<string> {
	const members: { key: string; index: number }[] = [];
	for (const finding of findings) {
		const key = sourceAttributedFindingKey(finding);
		const rosterFinding = index.byKey.get(key);
		if (rosterFinding === undefined || members.some((member) => member.key === key)) {
			return aggregationFailure(
				"review-aggregation-invalid-request",
				"Invalid cluster membership.",
			);
		}
		members.push({ key, index: rosterFinding.index });
	}
	members.sort((left, right) => left.index - right.index);
	return { ok: true, value: JSON.stringify(members.map((member) => member.key)) };
}

function invalidConstraints(message: string): ReviewResult<never> {
	return aggregationFailure("review-aggregation-invalid-constraints", message);
}

function invalidAccounting(message: string): ReviewResult<never> {
	return aggregationFailure("review-aggregation-invalid-accounting", message);
}

function aggregationFailure(
	code:
		| "review-aggregation-invalid-request"
		| "review-aggregation-invalid-prior-result"
		| "review-aggregation-invalid-constraints"
		| "review-aggregation-model-resolution-failed"
		| "review-aggregation-invalid-accounting",
	message: string,
): ReviewResult<never> {
	return { ok: false, error: { code, message } };
}
