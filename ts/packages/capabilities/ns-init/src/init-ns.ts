import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok, usageError } from "@nseng-ai/clinkr";
import {
	ALL_HARNESS_IDS,
	normalizeHarnessSelection,
	parseNsTomlHarnesses,
	planNsTomlHarnessesWrite,
	type HarnessId,
	type NsTomlChange,
} from "@nseng-ai/harness-artifacts/api";
import { z } from "zod";

import {
	activationCompletedSchema,
	applyNsActivation,
	prepareNsActivation,
	resolveActivationRepository,
	type FileActivationOutcome,
	type ResolveActivationRepositoryResult,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";
import { ACTIVATION_FILE_PATHS, type ActivationFile } from "./activation-files.ts";

export const initNsRequestSchema = z.object({
	harness: z
		.array(z.string())
		.default([])
		.describe("Harness to activate; repeatable. One of claude-code, codex, pi."),
});

export const initNsResultSchema = z.object({
	repoRoot: z.string(),
	trunkBranch: z.string(),
	harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
	harnessSource: z.enum(["explicit", "ns-toml"]),
	completed: activationCompletedSchema,
});

export type InitNsRequest = z.infer<typeof initNsRequestSchema>;
export type InitNsResult = z.infer<typeof initNsResultSchema>;

export async function initNs(
	context: NsActivationContext,
	request: InitNsRequest & { readonly cwd: string },
): Promise<ClinkrExit<InitNsResult>> {
	const repositoryResult = await resolveActivationRepository(context, request.cwd);
	if (repositoryResult.type !== "resolved") return repositoryFailure(repositoryResult);
	const { repoRoot } = repositoryResult.repository;
	const configRead = await context.files.readActivationFile({ repoRoot, file: "ns-toml" });
	if (configRead.type === "error") {
		return preflightFailure([
			{ code: configRead.error.code, message: configRead.error.message, path: "ns.toml" },
		]);
	}
	if (configRead.type === "not-file") {
		return preflightFailure([
			{ code: "ns-toml-not-file", message: "ns.toml exists but is not a file.", path: "ns.toml" },
		]);
	}
	const existingContent = configRead.type === "found" ? configRead.content : undefined;
	const harnessResolution = resolveHarnesses(existingContent, request.harness);
	if (harnessResolution.type === "usage-error")
		return usageError(harnessResolution.message, harnessResolution.data);
	if (harnessResolution.type === "failure") return preflightFailure([harnessResolution.diagnostic]);

	const prepared = await prepareNsActivation(context, {
		repository: repositoryResult.repository,
		harnesses: harnessResolution.harnesses,
		harnessSource: harnessResolution.harnessSource,
		nsTomlContent: harnessResolution.nsTomlContent,
		nsTomlChange: harnessResolution.nsTomlChange,
		nsTomlExpected:
			configRead.type === "found"
				? { type: "file", content: configRead.content }
				: { type: "missing" },
	});
	if (prepared.type === "preflight-failed") return preflightFailure(prepared.diagnostics);
	const applied = await applyNsActivation(context, prepared.activation);
	if (applied.type === "apply-failed") {
		return failure("ns-init-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: applied.error,
			completed: applied.completed,
		});
	}
	return ok({
		repoRoot,
		trunkBranch: repositoryResult.repository.trunkBranch,
		harnesses: [...harnessResolution.harnesses],
		harnessSource: harnessResolution.harnessSource,
		completed: applied.completed,
	});
}

type HarnessResolution =
	| {
			readonly type: "ok";
			readonly harnesses: readonly HarnessId[];
			readonly harnessSource: "explicit" | "ns-toml";
			readonly nsTomlContent: string;
			readonly nsTomlChange: NsTomlChange;
	  }
	| { readonly type: "usage-error"; readonly message: string; readonly data: unknown }
	| {
			readonly type: "failure";
			readonly diagnostic: {
				readonly code: string;
				readonly message: string;
				readonly path: string;
			};
	  };

function resolveHarnesses(
	existingContent: string | undefined,
	explicitValues: readonly string[],
): HarnessResolution {
	if (explicitValues.length > 0) {
		const explicit = normalizeHarnessSelection(explicitValues);
		if (explicit.type === "error") {
			return {
				type: "usage-error",
				message: explicit.error.message,
				data: { argument: "harness", code: explicit.error.code },
			};
		}
		const plan = planNsTomlHarnessesWrite({
			content: existingContent,
			harnesses: explicit.harnesses,
		});
		if (plan.type === "error") {
			return {
				type: "failure",
				diagnostic: { code: plan.error.code, message: plan.error.message, path: "ns.toml" },
			};
		}
		return {
			type: "ok",
			harnesses: explicit.harnesses,
			harnessSource: "explicit",
			nsTomlContent: plan.content,
			nsTomlChange: plan.change,
		};
	}
	if (existingContent === undefined) return harnessUsageError();
	const parsed = parseNsTomlHarnesses(existingContent);
	if (parsed.type === "missing") return harnessUsageError();
	if (parsed.type === "error") {
		return {
			type: "failure",
			diagnostic: { code: parsed.error.code, message: parsed.error.message, path: "ns.toml" },
		};
	}
	return {
		type: "ok",
		harnesses: parsed.harnesses,
		harnessSource: "ns-toml",
		nsTomlContent: existingContent,
		nsTomlChange: "unchanged",
	};
}

function harnessUsageError(): HarnessResolution {
	return {
		type: "usage-error",
		message:
			"Pass at least one --harness on first ns init run, or add top-level harnesses to ns.toml.",
		data: { argument: "harness", configFile: "ns.toml" },
	};
}

function preflightFailure(
	diagnostics: readonly {
		readonly code: string;
		readonly message: string;
		readonly path?: string;
	}[],
): ClinkrExit<InitNsResult> {
	return failure("ns-init-preflight-failed", "ns init preflight failed; no files were written.", {
		phase: "preflight",
		diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
		completed: {},
	});
}

function repositoryFailure(
	result: Exclude<ResolveActivationRepositoryResult, { type: "resolved" }>,
): ClinkrExit<InitNsResult> {
	switch (result.type) {
		case "not-a-git-repo":
			return failure("ns-init-not-a-git-repo", result.message, {
				phase: "preflight",
				diagnostics: [{ code: "not-a-git-repo", message: result.message, path: result.cwd }],
				completed: {},
			});
		case "trunk-undetectable":
			return failure("ns-init-trunk-undetectable", result.message, {
				phase: "preflight",
				diagnostics: [
					{ code: "trunk-undetectable", message: result.message, path: result.repoRoot },
				],
				completed: {},
			});
		case "error":
			return failure("ns-init-activation-failed", result.error.message, {
				phase: "preflight",
				diagnostics: [result.error],
				completed: {},
			});
	}
}

export function renderInitNsHuman(data: InitNsResult): string {
	const completed = data.completed;
	const fileOutcomes: readonly (readonly [ActivationFile, FileActivationOutcome | undefined])[] = [
		["ns-toml", completed.nsToml],
		["managed-extensions-ignore", completed.managedExtensionsIgnore],
		["agents-instructions", completed.agentsInstructionFile],
		["claude-instructions", completed.claudeInstructionFile],
		["generated-instructions", completed.generatedInstructionsFile],
	];
	const fileRows = fileOutcomes.flatMap(([file, outcome]) =>
		outcome === undefined ? [] : [[ACTIVATION_FILE_PATHS[file], outcome.change] as const],
	);
	const directoryRows = (completed.consumerDirectories ?? []).map(
		(outcome) => [outcome.path, outcome.change] as const,
	);
	const artifactRows = (completed.artifacts ?? []).map(
		(outcome) =>
			[
				`${outcome.skillName} (${outcome.harness})`,
				outcome.removalReason === undefined
					? outcome.action
					: `${outcome.action} [${outcome.removalReason}]`,
			] as const,
	);
	const labelWidth =
		Math.max(
			0,
			...[...fileRows, ...directoryRows, ...artifactRows].map(([label]) => label.length),
		) + 2;
	const lines = [
		`Activated ns in ${data.repoRoot}.`,
		`Harnesses (${data.harnessSource}): ${data.harnesses.join(", ")}.`,
	];
	appendReportSection(lines, "Files:", fileRows, labelWidth);
	appendReportSection(lines, "Consumer directories:", directoryRows, labelWidth);
	appendReportSection(lines, "Artifacts:", artifactRows, labelWidth);
	return lines.join("\n");
}

function appendReportSection(
	lines: string[],
	title: string,
	rows: readonly (readonly [string, string])[],
	labelWidth: number,
): void {
	if (rows.length === 0) return;
	lines.push(title);
	for (const [label, value] of rows) {
		lines.push(`  ${label.padEnd(labelWidth)}${value}`);
	}
}
