import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ErrorInfo } from "@nseng-ai/foundation/result";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import {
	formatCommandFailureConciseCause,
	formatErrorInfoDiagnosticLines,
} from "@nseng-ai/capability-kit/gateway-result";

import { orchestratePrDescription } from "./index.ts";
import { resolvePrDescriptionGeneration, type PrDescriptionGenerationResolution } from "./index.ts";
import type { PrewrittenPrMetadata } from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import type {
	SubmitPrDescriptionPreview,
	SubmitPrDescriptionSummary,
} from "./submit-pr-description-summary.ts";
import type {
	PrDescriptionContent,
	PrDescriptionOrchestrationResult,
} from "./pr-description-orchestration.ts";
import { formatPrLinkTextRow, prNumberFromLink } from "./submit-pr-link.ts";
import type { SubmitPrDescriptionOptions } from "./submit.ts";
import { formatBatchPosition, formatItemCount } from "./submit-format.ts";
import type { SubmitProgressListeners } from "./submit-progress-listeners.ts";
import type { SubmitMatrixCellState } from "./submit-matrix-progress.ts";

export type SubmitPrDescriptionGenerationResult =
	| ({ ok: true } & SubmitPrDescriptionSummary)
	| { ok: false; failures: PrDescriptionFailure[] };

export interface PrDescriptionFailure {
	link: SubmitPrLink;
	number: number;
	reason: string;
	diagnostic?: ErrorInfo;
}

interface PrDescriptionAccumulator {
	generated: SubmitPrLink[];
	skipped: SubmitPrLink[];
	prewritten: SubmitPrLink[];
	prewriteFallbacks: SubmitPrLink[];
	previews: SubmitPrDescriptionPreview[];
	failures: PrDescriptionFailure[];
}

type PrDescriptionLinkBucketName = "generated" | "prewritten" | "prewriteFallbacks";

export interface SubmitPrDescriptionProgressEvent {
	prNumber: number;
	state: Exclude<SubmitMatrixCellState, "pending">;
	message?: string;
}

export type SubmitPrDescriptionProgressListener = (event: SubmitPrDescriptionProgressEvent) => void;

export async function generateSubmitPrDescriptions(input: {
	cwd: string;
	prDescription: SubmitPrDescriptionOptions;
	prLinks: readonly SubmitPrLink[];
	/** PRs in this set are generated only when their current GitHub body is empty. */
	emptyBodyOnlyPrLinks?: readonly SubmitPrLink[];
	prewrittenMetadata?: readonly PrewrittenPrMetadata[];
	progress?: SubmitProgressListeners<SubmitPrDescriptionProgressEvent>;
}): Promise<SubmitPrDescriptionGenerationResult> {
	let accumulator: PrDescriptionAccumulator = createPrDescriptionAccumulator();
	const emptyBodyOnlyPrUrls = new Set((input.emptyBodyOnlyPrLinks ?? []).map((link) => link.url));
	const prewrittenByBranch = new Map(
		(input.prewrittenMetadata ?? []).map((metadata) => [metadata.branch, metadata]),
	);
	let generation: Extract<PrDescriptionGenerationResolution, { ok: true }> | undefined;

	if (input.prLinks.length === 0) {
		input.progress?.onProgress?.("no PR links available for description generation");
	} else {
		input.progress?.onProgress?.(
			`preparing descriptions for ${formatItemCount(input.prLinks.length, "PR", "PRs")}`,
		);
	}

	// Intentionally sequential: deterministic output ordering and gentler on gh/API rate limits.
	for (const [index, link] of input.prLinks.entries()) {
		const number = prNumberFromLink(link);
		if (number === undefined) continue;

		input.progress?.onProgress?.(
			`loading PR #${number} metadata (${index + 1}/${input.prLinks.length})`,
		);
		input.progress?.onItemProgress?.({
			prNumber: number,
			state: "active",
			message: "loading PR metadata",
		});
		const viewed = await input.prDescription.githubPr.viewPr({ cwd: input.cwd, number });
		if (!viewed.ok) {
			input.progress?.onItemProgress?.({
				prNumber: number,
				state: "failed",
				message: firstNonEmptyLine(viewed.error.message) ?? "metadata load failed",
			});
			accumulator = collectPrDescriptionFailure(accumulator, {
				link,
				number,
				reason: viewed.error.message,
				diagnostic: viewed.error,
			});
			continue;
		}

		if (emptyBodyOnlyPrUrls.has(link.url) && viewed.value.body.trim() !== "") {
			input.progress?.onProgress?.(
				`skipping PR #${number} description; existing PR body is not empty`,
			);
			input.progress?.onItemProgress?.({
				prNumber: number,
				state: "skipped",
				message: "existing description",
			});
			accumulator = {
				...accumulator,
				skipped: [...accumulator.skipped, link],
			};
			continue;
		}

		const prewrittenMetadata = prewrittenByBranch.get(viewed.value.headRefName);
		if (prewrittenMetadata === undefined && generation === undefined) {
			input.progress?.onProgress?.("resolving PR description prompt and model");
			const resolvedGeneration = await resolvePrDescriptionGeneration({
				cwd: input.cwd,
				env: input.prDescription.env,
				git: input.prDescription.git,
				descriptorSource: input.prDescription.descriptorSource,
			});
			if (!resolvedGeneration.ok) {
				input.progress?.onItemProgress?.({
					prNumber: number,
					state: "failed",
					message: firstNonEmptyLine(resolvedGeneration.error) ?? "generation setup failed",
				});
				accumulator = collectPrDescriptionFailure(accumulator, {
					link,
					number,
					reason: resolvedGeneration.error,
				});
				continue;
			}
			generation = resolvedGeneration;
		}

		const result = await orchestratePrDescription({
			cwd: input.cwd,
			env: input.prDescription.env,
			githubPr: input.prDescription.githubPr,
			textGenerator: input.prDescription.textGenerator,
			git: input.prDescription.git,
			descriptorSource: input.prDescription.descriptorSource,
			pr: viewed.value,
			...(generation === undefined ? {} : { generation }),
			activeOperationDetail: formatBatchPosition({
				noun: "PR",
				index,
				total: input.prLinks.length,
			}),
			...(prewrittenMetadata === undefined ? {} : { prewrittenMetadata }),
			...optionalEntry("progress", input.progress),
			...(input.prDescription.time === undefined ? {} : { time: input.prDescription.time }),
		});

		const progress = prProgressForResult(result);
		input.progress?.onItemProgress?.({
			prNumber: number,
			state: progress.state,
			...optionalEntry("message", progress.message),
		});
		accumulator = collectPrDescriptionResult({
			result,
			link,
			number,
			accumulator,
			...(input.progress?.onProgress === undefined
				? {}
				: { onProgress: input.progress.onProgress }),
		});
	}

	if (accumulator.failures.length > 0) {
		return { ok: false, failures: accumulator.failures };
	}
	return {
		ok: true,
		generated: accumulator.generated,
		skipped: accumulator.skipped,
		prewritten: accumulator.prewritten,
		prewriteFallbacks: accumulator.prewriteFallbacks,
		previews: accumulator.previews,
	};
}

function createPrDescriptionAccumulator(): PrDescriptionAccumulator {
	return {
		generated: [],
		skipped: [],
		prewritten: [],
		prewriteFallbacks: [],
		previews: [],
		failures: [],
	};
}

function prProgressForResult(result: PrDescriptionOrchestrationResult): {
	state: SubmitPrDescriptionProgressEvent["state"];
	message?: string;
} {
	switch (result.type) {
		case "skipped":
			return { state: "skipped", message: "skipped (unchanged)" };
		case "matched_prewritten":
			return { state: "done", message: "prewritten" };
		case "updated":
			return { state: "done", message: "updated" };
		case "generated":
			return { state: "done", message: "generated" };
		case "failed":
			return { state: "failed", message: firstNonEmptyLine(result.reason) ?? "description failed" };
	}
}

function collectPrDescriptionResult(input: {
	result: PrDescriptionOrchestrationResult;
	link: SubmitPrLink;
	number: number;
	accumulator: PrDescriptionAccumulator;
	onProgress?: (message: string) => void;
}): PrDescriptionAccumulator {
	switch (input.result.type) {
		case "skipped":
			return {
				...input.accumulator,
				skipped: [...input.accumulator.skipped, input.link],
			};
		case "matched_prewritten":
			return collectPrDescriptionSuccess({
				accumulator: input.accumulator,
				bucketName: "prewritten",
				link: input.link,
				content: input.result,
			});
		case "updated":
			return collectPrDescriptionSuccess({
				accumulator: input.accumulator,
				bucketName: "prewriteFallbacks",
				link: input.link,
				content: input.result,
			});
		case "generated": {
			const accumulator = collectPrDescriptionSuccess({
				accumulator: input.accumulator,
				bucketName: "generated",
				link: input.link,
				content: input.result,
			});
			input.onProgress?.(`finished PR #${input.number} description`);
			return accumulator;
		}
		case "failed":
			return collectPrDescriptionFailure(input.accumulator, {
				link: input.link,
				number: input.number,
				reason: input.result.reason,
				...(input.result.diagnostic === undefined ? {} : { diagnostic: input.result.diagnostic }),
			});
	}
}

function collectPrDescriptionFailure(
	accumulator: PrDescriptionAccumulator,
	failure: PrDescriptionFailure,
): PrDescriptionAccumulator {
	return {
		...accumulator,
		failures: [...accumulator.failures, failure],
	};
}

function collectPrDescriptionSuccess(input: {
	accumulator: PrDescriptionAccumulator;
	bucketName: PrDescriptionLinkBucketName;
	link: SubmitPrLink;
	content: PrDescriptionContent;
}): PrDescriptionAccumulator {
	const preview = prDescriptionPreview(input.link, input.content.title, input.content.previewBody);
	switch (input.bucketName) {
		case "generated":
			return {
				...input.accumulator,
				generated: [...input.accumulator.generated, input.link],
				previews: [...input.accumulator.previews, preview],
			};
		case "prewritten":
			return {
				...input.accumulator,
				prewritten: [...input.accumulator.prewritten, input.link],
				previews: [...input.accumulator.previews, preview],
			};
		case "prewriteFallbacks":
			return {
				...input.accumulator,
				prewriteFallbacks: [...input.accumulator.prewriteFallbacks, input.link],
				previews: [...input.accumulator.previews, preview],
			};
	}
}

function prDescriptionPreview(
	link: SubmitPrLink,
	title: string,
	previewBody: string,
): SubmitPrDescriptionPreview {
	return {
		link,
		title: title.trim(),
		descriptionFirstLine: firstNonEmptyLine(previewBody),
	};
}

export function formatPrDescriptionFailureText(
	prLinks: readonly SubmitPrLink[],
	failures: readonly PrDescriptionFailure[],
): string {
	const lines = [
		"PRs were submitted; description generation failed.",
		"",
		"Submitted PRs:",
		...(prLinks.length > 0
			? prLinks.map(formatPrLinkTextRow)
			: ["• (no PR URLs detected in submit output)"]),
		"",
		"Description failures:",
		...failures.map(formatPrDescriptionFailureRow),
		"",
		"Checkout the branch and run `ns flow regenerate-pr` to regenerate its PR description.",
	];
	return lines.join("\n");
}

function formatPrDescriptionFailureRow(failure: PrDescriptionFailure): string {
	const cause = formatCommandFailureConciseCause(failure.diagnostic);
	if (cause === undefined) return `${formatPrLinkTextRow(failure.link)}: ${failure.reason}`;
	return `${formatPrLinkTextRow(failure.link)}: ${failure.reason}\n  Cause: ${cause}`;
}

export function formatPrDescriptionFailureDiagnostics(
	failures: readonly PrDescriptionFailure[],
): string[] {
	return failures.flatMap((failure) => {
		if (failure.diagnostic === undefined) return [];
		return [formatPrDescriptionFailureDiagnostic(failure)];
	});
}

function formatPrDescriptionFailureDiagnostic(failure: PrDescriptionFailure): string {
	const diagnostic = failure.diagnostic;
	if (diagnostic === undefined) {
		throw new Error("Cannot format PR description diagnostic without a diagnostic.");
	}

	const lines = [
		`PR #${failure.number} ${failure.link.url}:`,
		...formatErrorInfoDiagnosticLines(diagnostic).map((line) => `  ${line}`),
	];
	return lines.join("\n");
}
