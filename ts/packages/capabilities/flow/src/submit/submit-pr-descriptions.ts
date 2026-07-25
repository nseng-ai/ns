import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ErrorInfo } from "@nseng-ai/foundation/result";
import { firstNonEmptyLine } from "@nseng-ai/foundation/text-normalization";
import {
	formatCommandFailureConciseCause,
	formatErrorInfoDiagnosticLines,
} from "@nseng-ai/capability-kit/gateway-result";

import {
	applyPreparedPrMetadataReplacement,
	preparePrMetadataReplacement,
	resolvePrDescriptionGeneration,
	type PreparedPrMetadataReplacement,
} from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import type {
	SubmitPrDescriptionPreview,
	SubmitPrDescriptionSummary,
} from "./submit-pr-description-summary.ts";
import { formatPrLinkTextRow, prNumberFromLink } from "./submit-pr-link.ts";
import type { SubmitPrDescriptionOptions } from "./submit.ts";
import { formatBatchPosition } from "./submit-format.ts";
import type { SubmitProgressListeners } from "./submit-progress-listeners.ts";
import type { SubmitMatrixCellState } from "./submit-matrix-progress.ts";

export type SubmitPrDescriptionGenerationResult =
	| ({ ok: true } & SubmitPrDescriptionSummary)
	| {
			ok: false;
			stage: "preparation" | "application";
			failures: PrDescriptionFailure[];
			applied: readonly SubmitPrLink[];
			notAttempted: readonly SubmitPrLink[];
	  };

export interface PrDescriptionFailure {
	link: SubmitPrLink;
	number: number;
	reason: string;
	diagnostic?: ErrorInfo;
}

export interface SubmitPrDescriptionProgressEvent {
	prNumber: number;
	state: Exclude<SubmitMatrixCellState, "pending">;
	message?: string;
}

export async function generateSubmitPrDescriptions(input: {
	cwd: string;
	prDescription: SubmitPrDescriptionOptions;
	prLinks: readonly SubmitPrLink[];
	progress?: SubmitProgressListeners<SubmitPrDescriptionProgressEvent>;
}): Promise<SubmitPrDescriptionGenerationResult> {
	const selected = input.prLinks
		.map((link) => ({ link, number: prNumberFromLink(link) }))
		.filter((item): item is { link: SubmitPrLink; number: number } => item.number !== undefined)
		.sort((left, right) => left.link.url.localeCompare(right.link.url));
	if (selected.length === 0) {
		input.progress?.onProgress?.("no PRs selected for metadata replacement");
		return { ok: true, applied: [], previews: [] };
	}

	input.progress?.onProgress?.("resolving PR description prompt and model");
	const generation = await resolvePrDescriptionGeneration({
		cwd: input.cwd,
		env: input.prDescription.env,
		git: input.prDescription.git,
		descriptorSource: input.prDescription.descriptorSource,
		modelSelection: input.prDescription.modelSelection,
	});
	if (!generation.ok) {
		const first = selected[0];
		if (first === undefined) throw new Error("Selected PR list unexpectedly empty.");
		return {
			ok: false,
			stage: "preparation",
			failures: [{ link: first.link, number: first.number, reason: generation.error }],
			applied: [],
			notAttempted: selected.slice(1).map((item) => item.link),
		};
	}

	const prepared: Array<{ link: SubmitPrLink; replacement: PreparedPrMetadataReplacement }> = [];
	const failures: PrDescriptionFailure[] = [];
	for (const [index, item] of selected.entries()) {
		input.progress?.onItemProgress?.({
			prNumber: item.number,
			state: "active",
			message: "preparing complete metadata",
		});
		const viewed = await input.prDescription.githubPr.viewPr({
			cwd: input.cwd,
			number: item.number,
		});
		if (!viewed.ok) {
			failures.push({
				link: item.link,
				number: item.number,
				reason: viewed.error.message,
				diagnostic: viewed.error,
			});
			input.progress?.onItemProgress?.({
				prNumber: item.number,
				state: "failed",
				message: firstNonEmptyLine(viewed.error.message) ?? "metadata load failed",
			});
			continue;
		}
		const result = await preparePrMetadataReplacement({
			cwd: input.cwd,
			env: input.prDescription.env,
			githubPr: input.prDescription.githubPr,
			textGenerator: input.prDescription.textGenerator,
			git: input.prDescription.git,
			descriptorSource: input.prDescription.descriptorSource,
			modelSelection: input.prDescription.modelSelection,
			pr: viewed.value,
			source: "submit",
			generation,
			activeOperationDetail: formatBatchPosition({ noun: "PR", index, total: selected.length }),
			...optionalEntry("progress", input.progress),
			...(input.prDescription.time === undefined ? {} : { time: input.prDescription.time }),
		});
		if (result.type === "failed") {
			failures.push({
				link: item.link,
				number: item.number,
				reason: result.reason,
				...optionalEntry("diagnostic", result.diagnostic),
			});
			input.progress?.onItemProgress?.({
				prNumber: item.number,
				state: "failed",
				message: firstNonEmptyLine(result.reason) ?? "metadata preparation failed",
			});
			continue;
		}
		prepared.push({ link: item.link, replacement: result });
		input.progress?.onItemProgress?.({
			prNumber: item.number,
			state: "active",
			message: "prepared; waiting to apply batch",
		});
	}
	if (failures.length > 0) {
		return {
			ok: false,
			stage: "preparation",
			failures,
			applied: [],
			notAttempted: prepared.map((item) => item.link),
		};
	}

	const applied: SubmitPrLink[] = [];
	const previews: SubmitPrDescriptionPreview[] = [];
	for (const [index, item] of prepared.entries()) {
		const appliedResult = await applyPreparedPrMetadataReplacement({
			cwd: input.cwd,
			githubPr: input.prDescription.githubPr,
			replacement: item.replacement,
		});
		if (!appliedResult.ok) {
			input.progress?.onItemProgress?.({
				prNumber: item.replacement.pr.number,
				state: "failed",
				message: firstNonEmptyLine(appliedResult.reason) ?? "metadata replacement failed",
			});
			return {
				ok: false,
				stage: "application",
				failures: [
					{
						link: item.link,
						number: item.replacement.pr.number,
						reason: appliedResult.reason,
						...optionalEntry("diagnostic", appliedResult.diagnostic),
					},
				],
				applied,
				notAttempted: prepared.slice(index + 1).map((candidate) => candidate.link),
			};
		}
		applied.push(item.link);
		previews.push({
			link: item.link,
			title: item.replacement.title.trim(),
			descriptionFirstLine: firstNonEmptyLine(item.replacement.previewBody),
		});
		input.progress?.onItemProgress?.({
			prNumber: item.replacement.pr.number,
			state: "done",
			message: "complete metadata replaced",
		});
	}
	return { ok: true, applied, previews };
}

export function formatPrDescriptionFailureText(
	prLinks: readonly SubmitPrLink[],
	result: Extract<SubmitPrDescriptionGenerationResult, { ok: false }>,
): string {
	const lines = [
		"PRs were submitted; PR metadata replacement failed.",
		"",
		"Submitted PRs:",
		...(prLinks.length > 0
			? prLinks.map(formatPrLinkTextRow)
			: ["• (no PR URLs detected in submit output)"]),
		"",
		result.stage === "preparation"
			? "Preparation failures (no PR metadata was edited):"
			: "Application failure:",
		...result.failures.map(formatPrDescriptionFailureRow),
	];
	if (result.applied.length > 0)
		lines.push("", "Applied before failure:", ...result.applied.map(formatPrLinkTextRow));
	if (result.notAttempted.length > 0)
		lines.push("", "Prepared but not attempted:", ...result.notAttempted.map(formatPrLinkTextRow));
	lines.push(
		"",
		"Checkout an affected branch and run `ns flow regenerate-pr` to replace its complete PR metadata.",
	);
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
	return failures.flatMap((failure) =>
		failure.diagnostic === undefined
			? []
			: [
					`PR #${failure.number} ${failure.link.url}:\n${formatErrorInfoDiagnosticLines(
						failure.diagnostic,
					)
						.map((line) => `  ${line}`)
						.join("\n")}`,
				],
	);
}
