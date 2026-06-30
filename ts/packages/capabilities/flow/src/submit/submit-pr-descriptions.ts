import { isRecord } from "@sdl/core/primitives";
import type { ErrorInfo } from "@sdl/core/result";
import { stripTerminalEscapes } from "@sdl/core/terminal-escapes";

import { orchestratePrDescription } from "./index.ts";
import { resolvePrDescriptionGeneration, type PrDescriptionGenerationResolution } from "./index.ts";
import { formatItemCount } from "./index.ts";
import type { PrewrittenPrMetadata } from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import { formatPrLinkTextRow, prNumberFromLink } from "./submit-pr-link.ts";
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
		"Checkout the branch and run `sdl flow regenerate-pr` to regenerate its PR description.",
	];
	return lines.join("\n");
}

function formatPrDescriptionFailureRow(failure: PrDescriptionFailure): string {
	const cause = formatPrDescriptionConciseCause(failure.diagnostic);
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
		`  code: ${diagnostic.code}`,
		`  message: ${diagnostic.message}`,
	];
	if (diagnostic.displayCommand !== undefined) {
		lines.push(`  display_command: ${diagnostic.displayCommand}`);
	}
	const details = recordDetails(diagnostic);
	if (details !== undefined) {
		for (const key of Object.keys(details).sort()) {
			lines.push(`  ${key}: ${formatDiagnosticDetail(details[key])}`);
		}
	}
	return lines.join("\n");
}

function formatPrDescriptionConciseCause(diagnostic: ErrorInfo | undefined): string | undefined {
	const details = recordDetails(diagnostic);
	if (details === undefined) return undefined;

	const command = diagnosticCommandLabel(diagnostic, details);
	const exitCode = detailNumber(details, "exit_code");
	const stderr = conciseDiagnosticText(detailString(details, "stderr"));
	if (exitCode !== undefined && stderr !== undefined) {
		return `${command} exited ${exitCode}: ${stderr}`;
	}

	const startupError = conciseDiagnosticText(detailString(details, "startup_error"));
	if (startupError !== undefined) return `${command} startup failed: ${startupError}`;

	return undefined;
}

function diagnosticCommandLabel(
	diagnostic: ErrorInfo | undefined,
	details: Record<string, unknown>,
): string {
	if (diagnostic?.displayCommand !== undefined && diagnostic.displayCommand.trim() !== "") {
		return diagnostic.displayCommand.trim();
	}
	const command = detailString(details, "command");
	return command ?? "command";
}

function recordDetails(diagnostic: ErrorInfo | undefined): Record<string, unknown> | undefined {
	const details = diagnostic?.details;
	return isRecord(details) ? details : undefined;
}

function detailString(details: Record<string, unknown>, key: string): string | undefined {
	const value = details[key];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

function detailNumber(details: Record<string, unknown>, key: string): number | undefined {
	const value = details[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function conciseDiagnosticText(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const normalized = stripTerminalEscapes(value).replace(/\s+/gu, " ").trim();
	if (normalized === "") return undefined;
	const maxChars = 300;
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

function formatDiagnosticDetail(value: unknown): string {
	if (Array.isArray(value)) return value.map(formatDiagnosticDetailAtom).join(" ");
	return formatDiagnosticDetailAtom(value);
}

function formatDiagnosticDetailAtom(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value === null) return "null";
	return JSON.stringify(value);
}
