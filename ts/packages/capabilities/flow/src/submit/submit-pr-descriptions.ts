import type { ErrorInfo } from "@ji/core/result";
import {
	formatCommandFailureConciseCause,
	formatErrorInfoDiagnosticLines,
} from "@ji/capability-kit/gateway-result";

import { orchestratePrDescription } from "./index.ts";
import { resolvePrDescriptionGeneration, type PrDescriptionGenerationResolution } from "./index.ts";
import type { PrewrittenPrMetadata } from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import { formatPrLinkTextRow, prNumberFromLink } from "./submit-pr-link.ts";
import type { SubmitPrDescriptionOptions } from "./submit.ts";
import { formatItemCount } from "./submit-format.ts";

export type SubmitPrDescriptionGenerationResult =
	| {
			ok: true;
			generated: SubmitPrLink[];
			skipped: SubmitPrLink[];
			prewritten: SubmitPrLink[];
			prewriteFallbacks: SubmitPrLink[];
	  }
	| { ok: false; failures: PrDescriptionFailure[] };

export interface PrDescriptionFailure {
	link: SubmitPrLink;
	number: number;
	reason: string;
	diagnostic?: ErrorInfo;
}

export async function generateSubmitPrDescriptions(input: {
	cwd: string;
	prDescription: SubmitPrDescriptionOptions;
	prLinks: readonly SubmitPrLink[];
	prewrittenMetadata?: readonly PrewrittenPrMetadata[];
	onProgress?: (message: string) => void;
}): Promise<SubmitPrDescriptionGenerationResult> {
	const generated: SubmitPrLink[] = [];
	const skipped: SubmitPrLink[] = [];
	const prewritten: SubmitPrLink[] = [];
	const prewriteFallbacks: SubmitPrLink[] = [];
	const failures: PrDescriptionFailure[] = [];
	const prewrittenByBranch = new Map(
		(input.prewrittenMetadata ?? []).map((metadata) => [metadata.branch, metadata]),
	);
	let generation: Extract<PrDescriptionGenerationResolution, { ok: true }> | undefined;

	if (input.prLinks.length === 0) {
		input.onProgress?.("no PR links available for description generation");
	} else {
		input.onProgress?.(
			`preparing descriptions for ${formatItemCount(input.prLinks.length, "PR", "PRs")}`,
		);
	}

	// Intentionally sequential: deterministic output ordering and gentler on gh/API rate limits.
	for (const [index, link] of input.prLinks.entries()) {
		const number = prNumberFromLink(link);
		if (number === undefined) continue;

		input.onProgress?.(`loading PR #${number} metadata (${index + 1}/${input.prLinks.length})`);
		const viewed = await input.prDescription.githubPr.viewPr({ cwd: input.cwd, number });
		if (!viewed.ok) {
			failures.push({
				link,
				number,
				reason: viewed.error.message,
				diagnostic: viewed.error,
			});
			continue;
		}

		const prewrittenMetadata = prewrittenByBranch.get(viewed.value.headRefName);
		if (prewrittenMetadata === undefined && generation === undefined) {
			input.onProgress?.("resolving PR description prompt and model");
			const resolvedGeneration = await resolvePrDescriptionGeneration({
				cwd: input.cwd,
				env: input.prDescription.env,
				git: input.prDescription.git,
			});
			if (!resolvedGeneration.ok) {
				failures.push({ link, number, reason: resolvedGeneration.error });
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
			pr: viewed.value,
			...(generation === undefined ? {} : { generation }),
			...(prewrittenMetadata === undefined ? {} : { prewrittenMetadata }),
			...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
		});

		switch (result.type) {
			case "skipped":
				skipped.push(link);
				break;
			case "matched_prewritten":
				prewritten.push(link);
				break;
			case "updated":
				prewriteFallbacks.push(link);
				break;
			case "generated":
				generated.push(link);
				input.onProgress?.(`finished PR #${number} description`);
				break;
			case "failed":
				failures.push({
					link,
					number,
					reason: result.reason,
					...(result.diagnostic === undefined ? {} : { diagnostic: result.diagnostic }),
				});
				break;
		}
	}

	if (failures.length > 0) {
		return { ok: false, failures };
	}
	return { ok: true, generated, skipped, prewritten, prewriteFallbacks };
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
		"Checkout the branch and run `ji flow regenerate-pr` to regenerate its PR description.",
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
