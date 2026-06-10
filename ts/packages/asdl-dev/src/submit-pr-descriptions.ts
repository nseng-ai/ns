import { applyGeneratedDescription, canOverwriteBody } from "./pr-description-apply.ts";
import type { SubmitPrDescriptionOptions, SubmitPrLink } from "./submit.ts";

export type SubmitPrDescriptionGenerationResult =
	| { ok: true; generated: SubmitPrLink[] }
	| { ok: false; failures: PrDescriptionFailure[] };

export interface PrDescriptionFailure {
	link?: SubmitPrLink;
	number?: number;
	reason: string;
}

export async function generateSubmitPrDescriptions(input: {
	cwd: string;
	prDescription: SubmitPrDescriptionOptions;
	prLinks: readonly SubmitPrLink[];
}): Promise<SubmitPrDescriptionGenerationResult> {
	const generated: SubmitPrLink[] = [];
	const failures: PrDescriptionFailure[] = [];

	for (const link of input.prLinks) {
		const number = prNumberFromLink(link);
		if (number === undefined) continue;

		const viewed = await input.prDescription.githubPr.viewPr({ cwd: input.cwd, number });
		if (!viewed.ok) {
			failures.push({ link, number, reason: viewed.error.message });
			continue;
		}

		if (!canOverwriteBody(viewed.value.body, false)) {
			continue;
		}

		const applied = await applyGeneratedDescription(viewed.value, {
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
	return { ok: true, generated };
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

function formatPrDescriptionFailureRow(failure: PrDescriptionFailure): string {
	const target = failure.link !== undefined ? formatPrLinkTextRow(failure.link).replace(/^• /, "") : failure.number === undefined ? "PR" : `#${failure.number}`;
	return `• ${target}: ${failure.reason}`;
}

function formatPrLinkTextRow(link: SubmitPrLink): string {
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

function prNumberFromUrl(url: string): string | undefined {
	const graphiteMatch = url.match(/^https:\/\/app\.graphite\.com\/github\/pr\/[^\/\s?#]+\/[^\/\s?#]+\/(\d+)(?:[\/?#].*)?$/);
	if (graphiteMatch?.[1]) return graphiteMatch[1];

	const githubMatch = url.match(/^https:\/\/github\.com\/[^\/\s?#]+\/[^\/\s?#]+\/pull\/(\d+)(?:[\/?#].*)?$/);
	return githubMatch?.[1];
}
