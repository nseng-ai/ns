import { appendGeneratedMarker, resolvePrDescriptionGeneration, type PrDescriptionGenerationResolution } from "./pr-description.ts";
import { applyGeneratedDescription, decidePrBodyOverwrite } from "./pr-description-apply.ts";
import { prNumberFromUrl, type SubmitPrLink } from "./gt-output.ts";
import type { PreparedSubmitPrMetadata } from "./submit-pr-metadata-prewrite.ts";
import type { SubmitPrDescriptionOptions } from "./submit.ts";

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
	let generation: Extract<PrDescriptionGenerationResolution, { ok: true }> | undefined;

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
			const reconciled = await reconcilePrewrittenPr({
				cwd: input.cwd,
				githubPr: input.prDescription.githubPr,
				link,
				number,
				title: viewed.value.title,
				body: viewed.value.body,
				prewrittenMetadata,
			});
			if (reconciled.kind === "matched") {
				prewritten.push(link);
			} else if (reconciled.kind === "updated") {
				prewriteFallbacks.push(link);
			} else {
				failures.push(reconciled.failure);
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

		const resolvedGeneration = generation ?? await resolvePrDescriptionGeneration({
			cwd: input.cwd,
			env: input.prDescription.env,
			git: input.prDescription.git,
		});
		if (!resolvedGeneration.ok) {
			failures.push({ link, number, reason: resolvedGeneration.error });
			continue;
		}
		generation = resolvedGeneration;

		const applied = await applyGeneratedDescription(viewed.value, decision.commits, {
			cwd: input.cwd,
			env: input.prDescription.env,
			githubPr: input.prDescription.githubPr,
			textGeneration: input.prDescription.textGeneration,
			git: input.prDescription.git,
			generation,
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

async function reconcilePrewrittenPr(input: {
	cwd: string;
	githubPr: SubmitPrDescriptionOptions["githubPr"];
	link: SubmitPrLink;
	number: number;
	title: string;
	body: string;
	prewrittenMetadata: PreparedSubmitPrMetadata;
}): Promise<{ kind: "matched" } | { kind: "updated" } | { kind: "failed"; failure: PrDescriptionFailure }> {
	if (prMetadataMatches(input.title, input.body, input.prewrittenMetadata)) {
		return { kind: "matched" };
	}

	const edited = await input.githubPr.editPr({
		cwd: input.cwd,
		number: input.number,
		title: input.prewrittenMetadata.title,
		body: appendGeneratedMarker(input.prewrittenMetadata.body),
	});
	if (edited.ok) return { kind: "updated" };

	return {
		kind: "failed",
		failure: {
			link: input.link,
			number: input.number,
			reason: `Generated initial metadata, but failed to update PR #${input.number} after Graphite created mismatched metadata.\n${edited.error.message}`,
		},
	};
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
