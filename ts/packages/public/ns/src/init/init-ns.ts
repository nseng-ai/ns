import type { CommandOutcome } from "@nseng-ai/clinkr/app";
import { failure, ok } from "@nseng-ai/clinkr/app";
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

export const initNsRequestSchema = z.object({});

export const initNsResultSchema = z.object({
	repoRoot: z.string(),
	trunkBranch: z.string(),
	completed: activationCompletedSchema,
	steps: z.array(lifecycleStepSchema).readonly(),
});

export type InitNsRequest = z.input<typeof initNsRequestSchema>;
export type InitNsResult = z.infer<typeof initNsResultSchema>;

export async function initNs(
	context: NsActivationContext,
	request: { readonly cwd: string },
): Promise<CommandOutcome<InitNsResult>> {
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
	const nsTomlContent = configRead.type === "found" ? configRead.content : "";
	recorder.beginPhase("activation-preflight");

	const prepared = await prepareNsActivation(
		context,
		{
			repository: repositoryResult.repository,
			nsTomlContent,
			nsTomlChange: configRead.type === "found" ? "unchanged" : "created",
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
		completed: applied.completed,
		steps: recorder.steps(),
	});
}

interface TracedInitFailure {
	command<TData extends object>(options: {
		readonly diagnostics: readonly LifecycleDiagnostic[];
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): CommandOutcome<InitNsResult>;
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
): CommandOutcome<InitNsResult> {
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
): CommandOutcome<InitNsResult> {
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
	return [
		`Activated ns in ${data.repoRoot}.`,
		...buildReportSection("Files:", fileRows),
		...buildReportSection("Consumer directories:", directoryRows),
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
