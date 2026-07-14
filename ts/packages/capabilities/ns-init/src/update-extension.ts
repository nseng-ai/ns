import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import type { ExtensionAcquisitionDiagnostic } from "@nseng-ai/sdk/extensions/acquisition";
import { planDeclaredExtensionTarget } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	type ActivationDiagnostic,
	applyNsActivation,
	prepareNsActivation,
} from "./activate-ns.ts";
import { activationCompletedSchema } from "./activation-outcomes.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type {
	ExtensionUpdateAcquisitionGateway,
	PreviewExtensionUpdateSourceResult,
	ReconcileExtensionUpdateSourceResult,
} from "./extension-acquisition.ts";
import {
	extensionLifecycleFailure,
	prepareExtensionLifecycle,
} from "./extension-lifecycle-preflight.ts";
import {
	normalizeExtensionDiagnostic,
	normalizeExtensionDiagnostics,
} from "./diagnostic-collection.ts";
import {
	createLifecycleRecorder,
	lifecycleStepSchema,
	renderLifecycleMarkdown,
	type LifecycleDiagnostic,
	type LifecycleRecorder,
} from "./lifecycle-observability.ts";

export interface ExtensionUpdateContext extends NsActivationContext {
	readonly updateAcquisition: ExtensionUpdateAcquisitionGateway;
}

export const updateExtensionRequestSchema = z.object({
	source: z.string().min(1),
	dryRun: z.boolean().default(false),
});
export const updateExtensionResultSchema = z.object({
	sourceSpec: z.string(),
	sourceKind: z.enum(["local", "npm"]),
	mode: z.enum(["dry-run", "applied"]),
	acquisitionIntent: z.enum(["refresh-floating", "ensure-pinned", "local-in-place"]),
	acquisitionOutcome: z.enum(["planned", "refreshed", "restored", "unchanged", "not-applicable"]),
	prospectiveEffects: z.enum(["available", "unavailable"]),
	repoRoot: z.string(),
	trunkBranch: z.string(),
	harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
	completed: activationCompletedSchema,
	steps: z.array(lifecycleStepSchema).readonly(),
});
export type UpdateExtensionRequest = z.infer<typeof updateExtensionRequestSchema> & {
	readonly cwd: string;
};
export type UpdateExtensionResult = z.infer<typeof updateExtensionResultSchema>;

export async function updateExtension(
	context: ExtensionUpdateContext,
	request: UpdateExtensionRequest,
): Promise<ClinkrExit<UpdateExtensionResult>> {
	const recorder = createLifecycleRecorder(context.lifecycleTrace);
	function tracedFailure<TData extends object>(options: {
		readonly diagnostic: LifecycleDiagnostic;
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): ClinkrExit<UpdateExtensionResult> {
		recorder.fail(options.diagnostic);
		return failure(options.errorType, options.message, {
			...options.data,
			steps: recorder.steps(),
		});
	}

	const preflight = await prepareExtensionLifecycle(context, request, recorder);
	if (preflight.type === "failed")
		return extensionLifecycleFailure("update", preflight.failure, recorder);
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses } = preflight.prepared;
	const target = planDeclaredExtensionTarget({
		projectRoot: repoRoot,
		nsTomlContent,
		requestedSpec: request.source,
	});
	if (!target.ok) {
		return tracedFailure({
			diagnostic: { code: target.reason, message: target.message, path: "ns.toml" },
			errorType: `ns-extension-update-${target.reason}`,
			message: target.message,
			data: { phase: "preflight", ...target, completed: {} },
		});
	}
	recorder.record({
		type: "declaration-decided",
		sourceSpec: target.matchedSpec,
		nsTomlPath: `${repoRoot}/ns.toml`,
		action: "unchanged",
	});
	recorder.beginPhase("acquisition");

	if (request.dryRun) {
		const preview = await context.updateAcquisition.preview({
			repoRoot,
			sourceSpec: target.matchedSpec,
		});
		if (preview.type === "failed") {
			const failureOptions = acquisitionFailure(target.matchedSpec, preview.diagnostics);
			return tracedFailure(failureOptions);
		}
		const facts = classifyUpdateOutcome(preview);
		recordAcquisition(
			recorder,
			target.matchedSpec,
			facts,
			preview.type === "preview-existing" ? preview.moduleRoot : undefined,
		);
		if (preview.type === "preview-existing") {
			recorder.beginPhase("activation-preflight");
			const prepared = await prepareNsActivation(
				context,
				{
					repository,
					harnesses,
					harnessSource: "ns-toml",
					nsTomlContent,
					nsTomlChange: "unchanged",
					nsTomlExpected: { type: "file", content: nsTomlContent },
				},
				recorder,
			);
			if (prepared.type === "preflight-failed") {
				const failureOptions = activationPreflightFailure(prepared.diagnostics, false);
				return tracedFailure(failureOptions);
			}
		}
		if (preview.type === "preview-apply-required") recorder.skipPhase("activation-preflight");
		recorder.skipPhase("activation-apply");
		recorder.record({ type: "effect", effect: "dry-run-no-writes" });
		recorder.record({
			type: "effect",
			effect:
				facts.prospectiveEffects === "available"
					? "prospective-effects-available"
					: "prospective-effects-unavailable",
		});
		recorder.complete();
		return ok({
			sourceSpec: target.matchedSpec,
			mode: "dry-run",
			...facts,
			repoRoot,
			trunkBranch,
			harnesses: [...harnesses],
			completed: { files: {} },
			steps: recorder.steps(),
		});
	}

	const reconciled = await context.updateAcquisition.reconcile({
		repoRoot,
		sourceSpec: target.matchedSpec,
	});
	if (reconciled.type === "failed") {
		const failureOptions = acquisitionFailure(target.matchedSpec, reconciled.diagnostics);
		return tracedFailure(failureOptions);
	}
	const facts = classifyUpdateOutcome(reconciled);
	recordAcquisition(recorder, target.matchedSpec, facts, reconciled.moduleRoot);
	recorder.beginPhase("activation-preflight");
	const prepared = await prepareNsActivation(
		context,
		{
			repository,
			harnesses,
			harnessSource: "ns-toml",
			nsTomlContent,
			nsTomlChange: "unchanged",
			nsTomlExpected: { type: "file", content: nsTomlContent },
		},
		recorder,
	);
	if (prepared.type === "preflight-failed") {
		const failureOptions = activationPreflightFailure(prepared.diagnostics, true);
		return tracedFailure(failureOptions);
	}
	recorder.beginPhase("activation-apply");
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		return tracedFailure({
			diagnostic: applied.error,
			errorType: "ns-extension-update-apply-failed",
			message: applied.error.message,
			data: {
				phase: applied.phase,
				error: normalizeExtensionDiagnostic(applied.error),
				completed: applied.completed,
			},
		});
	}
	recorder.complete();
	return ok({
		sourceSpec: target.matchedSpec,
		mode: "applied",
		...facts,
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed: applied.completed,
		steps: recorder.steps(),
	});
}

function recordAcquisition(
	recorder: LifecycleRecorder,
	sourceSpec: string,
	facts: PublicAcquisitionFacts,
	moduleRoot?: string,
): void {
	recorder.record({
		type: "acquisition-decided",
		sourceSpec,
		sourceKind: facts.sourceKind,
		intent: facts.acquisitionIntent,
		outcome: facts.acquisitionOutcome,
		...(moduleRoot === undefined ? {} : { moduleRoot }),
	});
}
function acquisitionFailure(
	sourceSpec: string,
	diagnostics: readonly ExtensionAcquisitionDiagnostic[],
) {
	const diagnostic = normalizeExtensionDiagnostic(
		diagnostics[0] ?? { code: "acquisition-failed", message: `Could not update ${sourceSpec}.` },
	);
	return {
		diagnostic,
		errorType: "ns-extension-update-acquisition-failed",
		message: diagnostic.message,
		data: {
			phase: "acquisition" as const,
			diagnostics: normalizeExtensionDiagnostics(diagnostics),
			completed: {},
		},
	};
}
function activationPreflightFailure(
	diagnostics: readonly ActivationDiagnostic[],
	sourceAcquisitionCompleted: boolean,
) {
	const diagnostic = diagnostics[0] ?? {
		code: "activation-preflight-failed",
		message: "Extension update activation preflight failed.",
	};
	return {
		diagnostic,
		errorType: "ns-extension-update-preflight-failed",
		message: "Extension update activation preflight failed.",
		data: {
			phase: "preflight" as const,
			diagnostics: normalizeExtensionDiagnostics(diagnostics),
			sourceAcquisitionCompleted,
			completed: {},
		},
	};
}

type SuccessfulUpdateAcquisition = Exclude<
	PreviewExtensionUpdateSourceResult | ReconcileExtensionUpdateSourceResult,
	{ readonly type: "failed" }
>;
type PublicAcquisitionFacts = Pick<
	UpdateExtensionResult,
	"sourceKind" | "acquisitionIntent" | "acquisitionOutcome" | "prospectiveEffects"
>;
export function classifyUpdateOutcome(
	acquisition: SuccessfulUpdateAcquisition,
): PublicAcquisitionFacts {
	switch (acquisition.type) {
		case "preview-existing":
			return {
				sourceKind: acquisition.sourceKind,
				acquisitionIntent: acquisition.intent,
				acquisitionOutcome: "planned",
				prospectiveEffects: "available",
			};
		case "preview-apply-required":
			return {
				sourceKind: acquisition.sourceKind,
				acquisitionIntent: acquisition.intent,
				acquisitionOutcome: "planned",
				prospectiveEffects: "unavailable",
			};
		case "applied":
			return {
				sourceKind: acquisition.sourceKind,
				acquisitionIntent: acquisition.intent,
				acquisitionOutcome:
					acquisition.outcome === "local-in-place" ? "not-applicable" : acquisition.outcome,
				prospectiveEffects: "available",
			};
	}
}
export function renderUpdateExtensionMarkdown(result: UpdateExtensionResult): string {
	const summary =
		result.mode === "dry-run"
			? `Dry run planned ${result.sourceSpec}; no writes were performed. Exact prospective effects are ${result.prospectiveEffects}.`
			: `Applied ${result.sourceSpec}; exact effects are ${result.prospectiveEffects}.`;
	return renderLifecycleMarkdown("ns extension update", summary, result.steps);
}
export function renderUpdateExtensionHuman(result: UpdateExtensionResult): string {
	return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; acquisition ${result.acquisitionOutcome}; exact prospective effects ${result.prospectiveEffects}.`;
}
