import { appendGeneratedMarker } from "./pr-description.ts";
import { applyGeneratedDescription, decidePrBodyOverwrite } from "./pr-description-apply.ts";
import type { PreparedSubmitPrMetadata } from "./submit-pr-metadata-prewrite.ts";
import type { SubmitPrDescriptionOptions, SubmitPrLink } from "./submit.ts";

export type SubmitPrDescriptionGenerationResult =
	| { ok: true; generated: SubmitPrLink[]; skipped: SubmitPrLink[]; prewritten: SubmitPrLink[]; prewriteFallbacks: SubmitPrLink[] }
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
}): Promise<SubmitPrDescriptionGenerationResult> {
	const generated: SubmitPrLink[] = [];
	const skipped: SubmitPrLink[] = [];
	const prewritten: SubmitPrLink[] = [];
	const prewriteFallbacks: SubmitPrLink[] = [];
	const failures: PrDescriptionFailure[] = [];
	const prewrittenByBranch = new Map((input.prewrittenMetadata ?? []).map((metadata) => [metadata.branch, metadata]));

	// Intentionally sequential: deterministic output ordering and gentler on gh/API rate limits.
	for (const link of input.prLinks) {
		const number = prNumberFromLink(link);
		if (number === undefined) continue;

		const viewed = await input.prDescription.githubPr.viewPr({ cwd: input.cwd, number });
		if (!viewed.ok) {
			failures.push({ link, number, reason: viewed.error.message });
			continue;
		}

		const prewrittenMetadata = prewrittenByBranch.get(viewed.value.headRefName);
		if (prewrittenMetadata !== undefined) {
			if (prMetadataMatches(viewed.value.title, viewed.value.body, prewrittenMetadata)) {
				prewritten.push(link);
				continue;
			}

			const edited = await input.prDescription.githubPr.editPr({
				cwd: input.cwd,
				number,
				title: prewrittenMetadata.title,
				body: appendGeneratedMarker(prewrittenMetadata.body),
			});
			if (edited.ok) {
				prewriteFallbacks.push(link);
			} else {
				failures.push({ link, number, reason: `Generated initial metadata, but failed to update PR #${number} after Graphite created mismatched metadata.\n${edited.error.message}` });
			}
			continue;
		}

		const decision = await decidePrBodyOverwrite({
			pr: viewed.value,
			shouldForce: false,
			cwd: input.cwd,
			githubPr: input.prDescription.githubPr,
		});
		if (decision.kind === "failed") {
			failures.push({ link, number, reason: decision.error });
			continue;
		}
		if (decision.kind === "skip_hand_edited") {
			skipped.push(link);
			continue;
		}

		const applied = await applyGeneratedDescription(viewed.value, decision.commits, {
			cwd: input.cwd,
			env: input.prDescription.env,
			githubPr: input.prDescription.githubPr,
			textGeneration: input.prDescription.textGeneration,
			git: input.prDescription.git,
		});
		if (applied.ok) {
			generated.push(link);
		} else {
			failures.push({ link, number, reason: applied.error });
		}
	}

	if (failures.length > 0) {
		return { ok: false, failures };
	}
	return { ok: true, generated, skipped, prewritten, prewriteFallbacks };
}

export function formatPrDescriptionFailureText(prLinks: readonly SubmitPrLink[], failures: readonly PrDescriptionFailure[]): string {
	const lines = [
		"PRs were submitted; description generation failed.",
		"",
		"Submitted PRs:",
		...(prLinks.length > 0 ? prLinks.map(formatPrLinkTextRow) : ["• (no PR URLs detected in submit output)"]),
		"",
		"Description failures:",
		...failures.map(formatPrDescriptionFailureRow),
		"",
		"Checkout the branch and run `asdl-dev pr-regen` to regenerate its PR description.",
	];
	return lines.join("\n");
}

function prMetadataMatches(title: string, body: string, metadata: PreparedSubmitPrMetadata): boolean {
	return title.trim() === metadata.title.trim() && body.trim() === metadata.body.trim();
}

function formatPrDescriptionFailureRow(failure: PrDescriptionFailure): string {
	return `${formatPrLinkTextRow(failure.link)}: ${failure.reason}`;
}

export function formatPrLinkTextRow(link: SubmitPrLink): string {
	if (link.label === link.url) return `• ${link.url}`;
	return `• ${link.label} ${link.url}`;
}

function prNumberFromLink(link: SubmitPrLink): number | undefined {
	const fromUrl = prNumberFromUrl(link.url);
	const value = fromUrl ?? link.label.match(/^#(\d+)$/)?.[1];
	if (value === undefined) return undefined;
	const number = Number.parseInt(value, 10);
	return Number.isSafeInteger(number) ? number : undefined;
}

export function prNumberFromUrl(url: string): string | undefined {
	const graphiteMatch = url.match(/^https:\/\/app\.graphite\.com\/github\/pr\/[^\/\s?#]+\/[^\/\s?#]+\/(\d+)(?:[\/?#].*)?$/);
	if (graphiteMatch?.[1]) return graphiteMatch[1];

	const githubMatch = url.match(/^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\/(\d+)(?:[\/?#].*)?$/);
	return githubMatch?.[1];
}
