import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok, usageError } from "@nseng-ai/clinkr";
import {
	ALL_HARNESS_IDS,
	normalizeHarnessSelection,
	parseNsTomlHarnesses,
	planNsTomlHarnessesWrite,
	type HarnessId,
	type NsTomlChange,
} from "../harness-artifacts/api.ts";
import { renderTextTable } from "@nseng-ai/foundation/text-table";
import { z } from "zod";

import {
	activationRepositoryFailureDiagnostic,
	activationRepositoryFailureType,
	applyNsActivation,
	prepareNsActivation,
	resolveActivationRepository,
	type ResolveActivationRepositoryResult,
} from "./activate-ns.ts";
import { activationCompletedSchema, type FileActivationOutcome } from "./activation-outcomes.ts";
import type { NsActivationContext } from "./activation-context.ts";
import { ACTIVATION_FILE_PATHS, ACTIVATION_FILES } from "./activation-files.ts";
import {
	createLifecycleRecorder,
	lifecycleStepSchema,
	renderLifecycleMarkdown,
	type LifecycleDiagnostic,
	type LifecycleRecorder,
	type LifecycleStep,
} from "./lifecycle-observability.ts";

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
	steps: z.array(lifecycleStepSchema).readonly(),
});

export type InitNsRequest = z.infer<typeof initNsRequestSchema>;
export type InitNsResult = z.infer<typeof initNsResultSchema>;

export async function initNs(
	context: NsActivationContext,
	request: InitNsRequest & { readonly cwd: string },
): Promise<ClinkrExit<InitNsResult, unknown, unknown, unknown>> {
	const recorder = createLifecycleRecorder(context.lifecycleTrace);
	const tracedFailure = createTracedInitFailure(recorder);
	recorder.beginPhase("repository-preflight");
	const repositoryResult = await resolveActivationRepository(context, request.cwd);
	if (repositoryResult.type !== "resolved")
		return repositoryFailure(repositoryResult, tracedFailure);
	const { repoRoot, trunkBranch } = repositoryResult.repository;
	recorder.record({ type: "repository-resolved", repoRoot, trunkBranch });
	recorder.beginPhase("configuration-preflight");
	const configRead = await context.files.readActivationFile({ repoRoot, file: "ns-toml" });
	if (configRead.type === "error") {
		return preflightFailure(
			[{ code: configRead.error.code, message: configRead.error.message, path: "ns.toml" }],
			tracedFailure,
		);
	}
	if (configRead.type === "not-file") {
		return preflightFailure(
			[{ code: "ns-toml-not-file", message: "ns.toml exists but is not a file.", path: "ns.toml" }],
			tracedFailure,
		);
	}
	const existingContent = configRead.type === "found" ? configRead.content : undefined;
	const harnessResolution = resolveHarnesses(existingContent, request.harness);
	if (harnessResolution.type === "usage-error") {
		return tracedFailure.usage({
			diagnostics: [
				{
					code: "harness-required",
					message: harnessResolution.message,
					path: "ns.toml",
				},
			],
			message: harnessResolution.message,
			data: harnessResolution.data,
		});
	}
	if (harnessResolution.type === "failure")
		return preflightFailure([harnessResolution.diagnostic], tracedFailure);
	recorder.record({
		type: "harnesses-resolved",
		source: harnessResolution.harnessSource,
		harnesses: [...harnessResolution.harnesses],
	});
	recorder.beginPhase("activation-preflight");

	const prepared = await prepareNsActivation(
		context,
		{
			repository: repositoryResult.repository,
			harnesses: harnessResolution.harnesses,
			harnessSource: harnessResolution.harnessSource,
			nsTomlContent: harnessResolution.nsTomlContent,
			nsTomlChange: harnessResolution.nsTomlChange,
			nsTomlExpected:
				configRead.type === "found"
					? { type: "file", content: configRead.content }
					: { type: "missing" },
		},
		recorder,
	);
	if (prepared.type === "preflight-failed")
		return preflightFailure(prepared.diagnostics, tracedFailure);
	recorder.beginPhase("activation-apply");
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		return tracedFailure.command({
			diagnostics: [applied.error],
			errorType: "ns-init-apply-failed",
			message: applied.error.message,
			data: {
				phase: applied.phase,
				error: applied.error,
				completed: applied.completed,
			},
		});
	}
	recorder.complete();
	return ok({
		repoRoot,
		trunkBranch: repositoryResult.repository.trunkBranch,
		harnesses: [...harnessResolution.harnesses],
		harnessSource: harnessResolution.harnessSource,
		completed: applied.completed,
		steps: recorder.steps(),
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
	| {
			readonly type: "usage-error";
			readonly message: string;
			readonly data: Readonly<Record<string, string>>;
	  }
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

interface TracedInitFailure {
	command<TData extends object>(options: {
		readonly diagnostics: readonly LifecycleDiagnostic[];
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): ClinkrExit<never, never, unknown, never>;
	usage<TData extends object>(options: {
		readonly diagnostics: readonly LifecycleDiagnostic[];
		readonly message: string;
		readonly data: TData;
	}): ClinkrExit<never, never, never, unknown>;
}

function createTracedInitFailure(recorder: LifecycleRecorder): TracedInitFailure {
	function failAndSnapshot(diagnostics: readonly LifecycleDiagnostic[]): readonly LifecycleStep[] {
		recorder.fail(selectInitFailureDiagnostic(diagnostics));
		return recorder.steps();
	}

	return {
		command(options) {
			return failure(options.errorType, options.message, {
				...options.data,
				steps: failAndSnapshot(options.diagnostics),
			});
		},
		usage(options) {
			return usageError(options.message, {
				...options.data,
				steps: failAndSnapshot(options.diagnostics),
			});
		},
	};
}

function selectInitFailureDiagnostic(
	diagnostics: readonly LifecycleDiagnostic[],
): LifecycleDiagnostic {
	return (
		diagnostics[0] ?? {
			code: "init-failed",
			message: "ns init failed without a diagnostic.",
		}
	);
}

function preflightFailure(
	diagnostics: readonly LifecycleDiagnostic[],
	tracedFailure: TracedInitFailure,
): ClinkrExit<InitNsResult, unknown, unknown, unknown> {
	return tracedFailure.command({
		diagnostics,
		errorType: "ns-init-preflight-failed",
		message: "ns init preflight failed; no files were written.",
		data: {
			phase: "preflight",
			diagnostics: diagnostics.map((item) => ({ ...item })),
			completed: {},
		},
	});
}

function repositoryFailure(
	result: Exclude<ResolveActivationRepositoryResult, { type: "resolved" }>,
	tracedFailure: TracedInitFailure,
): ClinkrExit<InitNsResult, unknown, unknown, unknown> {
	const diagnostic = activationRepositoryFailureDiagnostic(result);
	const errorType = activationRepositoryFailureType(result, {
		"not-a-git-repo": "ns-init-not-a-git-repo",
		"trunk-undetectable": "ns-init-trunk-undetectable",
		error: "ns-init-activation-failed",
	});
	return tracedFailure.command({
		diagnostics: [diagnostic],
		errorType,
		message: diagnostic.message,
		data: {
			phase: "preflight",
			diagnostics: [diagnostic],
			completed: {},
		},
	});
}

export function renderInitNsMarkdown(data: InitNsResult): string {
	return renderLifecycleMarkdown("ns init", `Activated ns in ${data.repoRoot}.`, data.steps);
}

export function renderInitNsHuman(data: InitNsResult): string {
	const completed = data.completed;
	const fileRows = ACTIVATION_FILES.flatMap((file) => {
		const outcome: FileActivationOutcome | undefined = completed.files[file];
		return outcome === undefined ? [] : [[ACTIVATION_FILE_PATHS[file], outcome.change] as const];
	});
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
	return [
		`Activated ns in ${data.repoRoot}.`,
		`Harnesses (${data.harnessSource}): ${data.harnesses.join(", ")}.`,
		...buildReportSection("Files:", fileRows),
		...buildReportSection("Consumer directories:", directoryRows),
		...buildReportSection("Artifacts:", artifactRows),
	].join("\n");
}

function buildReportSection(
	title: string,
	rows: readonly (readonly [string, string])[],
): readonly string[] {
	if (rows.length === 0) return [];
	const table = renderTextTable({
		columns: [{ header: "" }, { header: "" }],
		rows: rows.map(([label, value]) => [`  ${label}`, value]),
	});
	return [title, ...table.split("\n").slice(1)];
}
