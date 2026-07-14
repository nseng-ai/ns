import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import type { ExtensionAcquisitionDiagnostic } from "@nseng-ai/sdk/extensions/acquisition";
import { planDeclaredExtensionTarget } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	type ActivationDiagnostic,
	activationCompletedSchema,
	applyNsActivation,
	prepareNsActivation,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type {
	ExtensionUpdateAcquisitionGateway,
	PreviewExtensionUpdateSourceResult,
	ReconcileExtensionUpdateSourceResult,
} from "./extension-acquisition.ts";
import {
	extensionLifecycleFailure,
	normalizeExtensionLifecycleDiagnostic,
	prepareExtensionLifecycle,
} from "./extension-lifecycle-preflight.ts";
import {
	createLifecycleRecorder,
	lifecycleStepSchema,
	recordLifecycleFailure,
	renderLifecycleMarkdown,
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
	recorder.record({ type: "phase", phase: "repository-preflight", status: "started" });
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
		recordLifecycleFailure(recorder, "declaration-planning", {
			code: target.reason,
			message: target.message,
			path: "ns.toml",
		});
		return failure(`ns-extension-update-${target.reason}`, target.message, {
			phase: "preflight",
			...target,
			completed: {},
			steps: recorder.steps(),
		});
	}
	recorder.record({
		type: "declaration-decided",
		sourceSpec: target.matchedSpec,
		nsTomlPath: `${repoRoot}/ns.toml`,
		action: "unchanged",
	});
	recorder.record({ type: "phase", phase: "declaration-planning", status: "completed" });
	recorder.record({ type: "phase", phase: "acquisition", status: "started" });

	if (request.dryRun) {
		const preview = await context.updateAcquisition.preview({
			repoRoot,
			sourceSpec: target.matchedSpec,
		});
		if (preview.type === "failed")
			return acquisitionFailure(target.matchedSpec, preview.diagnostics, recorder);
		const facts = classifyUpdateOutcome(preview);
		recordAcquisition(
			recorder,
			target.matchedSpec,
			facts,
			preview.type === "preview-existing" ? preview.moduleRoot : undefined,
		);
		recorder.record({ type: "phase", phase: "acquisition", status: "completed" });
		if (preview.type === "preview-existing") {
			recorder.record({ type: "phase", phase: "activation-preflight", status: "started" });
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
			if (prepared.type === "preflight-failed")
				return activationPreflightFailure(prepared.diagnostics, false, recorder);
			recorder.record({ type: "phase", phase: "activation-preflight", status: "completed" });
		} else recorder.record({ type: "phase", phase: "activation-preflight", status: "skipped" });
		recorder.record({ type: "phase", phase: "activation-apply", status: "skipped" });
		recorder.record({ type: "effect", effect: "dry-run-no-writes" });
		recorder.record({
			type: "effect",
			effect:
				facts.prospectiveEffects === "available"
					? "prospective-effects-available"
					: "prospective-effects-unavailable",
		});
		recorder.record({ type: "phase", phase: "completion", status: "completed" });
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
	if (reconciled.type === "failed")
		return acquisitionFailure(target.matchedSpec, reconciled.diagnostics, recorder);
	const facts = classifyUpdateOutcome(reconciled);
	recordAcquisition(recorder, target.matchedSpec, facts, reconciled.moduleRoot);
	recorder.record({ type: "phase", phase: "acquisition", status: "completed" });
	recorder.record({ type: "phase", phase: "activation-preflight", status: "started" });
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
	if (prepared.type === "preflight-failed")
		return activationPreflightFailure(prepared.diagnostics, true, recorder);
	recorder.record({ type: "phase", phase: "activation-preflight", status: "completed" });
	recorder.record({ type: "phase", phase: "activation-apply", status: "started" });
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		recordLifecycleFailure(recorder, "activation-apply", applied.error);
		return failure("ns-extension-update-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: normalizeExtensionLifecycleDiagnostic(applied.error),
			completed: applied.completed,
			steps: recorder.steps(),
		});
	}
	recorder.record({ type: "phase", phase: "activation-apply", status: "completed" });
	recorder.record({ type: "phase", phase: "completion", status: "completed" });
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
	recorder: LifecycleRecorder,
) {
	const diagnostic = normalizeExtensionLifecycleDiagnostic(
		diagnostics[0] ?? { code: "acquisition-failed", message: `Could not update ${sourceSpec}.` },
	);
	recordLifecycleFailure(recorder, "acquisition", diagnostic);
	return failure("ns-extension-update-acquisition-failed", diagnostic.message, {
		phase: "acquisition",
		diagnostics: diagnostics.map(normalizeExtensionLifecycleDiagnostic),
		completed: {},
		steps: recorder.steps(),
	});
}
function activationPreflightFailure(
	diagnostics: readonly ActivationDiagnostic[],
	sourceAcquisitionCompleted: boolean,
	recorder: LifecycleRecorder,
) {
	const diagnostic = diagnostics[0] ?? {
		code: "activation-preflight-failed",
		message: "Extension update activation preflight failed.",
	};
	recordLifecycleFailure(recorder, "activation-preflight", diagnostic);
	return failure(
		"ns-extension-update-preflight-failed",
		"Extension update activation preflight failed.",
		{
			phase: "preflight",
			diagnostics: diagnostics.map(normalizeExtensionLifecycleDiagnostic),
			sourceAcquisitionCompleted,
			completed: {},
			steps: recorder.steps(),
		},
	);
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
