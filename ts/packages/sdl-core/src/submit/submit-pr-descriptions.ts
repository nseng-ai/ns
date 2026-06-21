import {
	orchestratePrDescription,
	type PrDescriptionOrchestrationResult,
} from "./pr-description-orchestration.ts";
import {
	resolvePrDescriptionGeneration,
	type PrDescriptionGenerationResolution,
} from "./pr-description.ts";
import { formatItemCount } from "./format.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import { formatPrLinkTextRow, prNumberFromLink } from "./submit-pr-link.ts";
import type { PreparedSubmitPrMetadata } from "./submit-pr-metadata-prewrite.ts";
import type { SubmitPrDescriptionOptions } from "./submit.ts";

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
}

export async function generateSubmitPrDescriptions(input: {
	cwd: string;
	prDescription: SubmitPrDescriptionOptions;
	prLinks: readonly SubmitPrLink[];
	prewrittenMetadata?: readonly PreparedSubmitPrMetadata[];
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
			failures.push({ link, number, reason: viewed.error.message });
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
			textGeneration: input.prDescription.textGeneration,
			git: input.prDescription.git,
			target: { type: "details", pr: viewed.value },
			...(generation === undefined ? {} : { generation }),
			...(prewrittenMetadata === undefined ? {} : { prewrittenMetadata }),
			...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
		});

		collectPrDescriptionResult({
			result,
			link,
			number,
			generated,
			skipped,
			prewritten,
			prewriteFallbacks,
			failures,
		});
		if (result.type === "generated") {
			input.onProgress?.(`finished PR #${number} description`);
		}
		if (result.type === "matched" && result.match === "generated_fingerprint") {
			input.onProgress?.(`skipping PR #${number} description; generated fingerprint is unchanged`);
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
		"Checkout the branch and run `sdl regenerate-pr` to regenerate its PR description.",
	];
	return lines.join("\n");
}

function collectPrDescriptionResult(params: {
	result: PrDescriptionOrchestrationResult;
	link: SubmitPrLink;
	number: number;
	generated: SubmitPrLink[];
	skipped: SubmitPrLink[];
	prewritten: SubmitPrLink[];
	prewriteFallbacks: SubmitPrLink[];
	failures: PrDescriptionFailure[];
}): void {
	switch (params.result.type) {
		case "matched":
			if (params.result.match === "generated_fingerprint") {
				params.skipped.push(params.link);
			} else {
				params.prewritten.push(params.link);
			}
			break;
		case "updated":
			params.prewriteFallbacks.push(params.link);
			break;
		case "generated":
			params.generated.push(params.link);
			break;
		case "failed":
			params.failures.push({
				link: params.link,
				number: params.number,
				reason: params.result.reason,
			});
			break;
	}
}

function formatPrDescriptionFailureRow(failure: PrDescriptionFailure): string {
	return `${formatPrLinkTextRow(failure.link)}: ${failure.reason}`;
}
