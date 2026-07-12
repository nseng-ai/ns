import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import type { ExtensionAcquisitionDiagnostic } from "@nseng-ai/kernel/extensions/acquisition";
import { planDeclaredExtensionTarget } from "@nseng-ai/kernel/project-config";
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
});

export type UpdateExtensionRequest = z.infer<typeof updateExtensionRequestSchema> & {
	readonly cwd: string;
};
export type UpdateExtensionResult = z.infer<typeof updateExtensionResultSchema>;

export async function updateExtension(
	context: ExtensionUpdateContext,
	request: UpdateExtensionRequest,
): Promise<ClinkrExit<UpdateExtensionResult>> {
	const preflight = await prepareExtensionLifecycle(context, request);
	if (preflight.type === "failed") return extensionLifecycleFailure("update", preflight.failure);
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses } = preflight.prepared;
	const target = planDeclaredExtensionTarget({
		projectRoot: repoRoot,
		nsTomlContent,
		requestedSpec: request.source,
	});
	if (!target.ok) {
		return failure(`ns-extension-update-${target.reason}`, target.message, {
			phase: "preflight",
			...target,
			completed: {},
		});
	}
	if (request.dryRun) {
		const preview = await context.updateAcquisition.preview({
			repoRoot,
			sourceSpec: target.matchedSpec,
		});
		if (preview.type === "failed") {
			return acquisitionFailure(target.matchedSpec, preview.diagnostics);
		}
		if (preview.type === "preview-existing") {
			const prepared = await prepareNsActivation(context, {
				repository,
				harnesses,
				harnessSource: "ns-toml",
				nsTomlContent,
				nsTomlChange: "unchanged",
				nsTomlExpected: { type: "file", content: nsTomlContent },
			});
			if (prepared.type === "preflight-failed") {
				return activationPreflightFailure(prepared.diagnostics, false);
			}
		}
		return ok({
			sourceSpec: target.matchedSpec,
			mode: "dry-run",
			...classifyUpdateOutcome(preview),
			repoRoot,
			trunkBranch,
			harnesses: [...harnesses],
			completed: { files: {} },
		});
	}

	const reconciled = await context.updateAcquisition.reconcile({
		repoRoot,
		sourceSpec: target.matchedSpec,
	});
	if (reconciled.type === "failed") {
		return acquisitionFailure(target.matchedSpec, reconciled.diagnostics);
	}
	const prepared = await prepareNsActivation(context, {
		repository,
		harnesses,
		harnessSource: "ns-toml",
		nsTomlContent,
		nsTomlChange: "unchanged",
		nsTomlExpected: { type: "file", content: nsTomlContent },
	});
	if (prepared.type === "preflight-failed") {
		return activationPreflightFailure(prepared.diagnostics, true);
	}
	const applied = await applyNsActivation(context, prepared.activation);
	if (applied.type === "apply-failed") {
		return failure("ns-extension-update-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: normalizeExtensionLifecycleDiagnostic(applied.error),
			completed: applied.completed,
		});
	}
	return ok({
		sourceSpec: target.matchedSpec,
		mode: "applied",
		...classifyUpdateOutcome(reconciled),
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed: applied.completed,
	});
}

function acquisitionFailure(
	sourceSpec: string,
	diagnostics: readonly ExtensionAcquisitionDiagnostic[],
) {
	return failure(
		"ns-extension-update-acquisition-failed",
		diagnostics[0]?.message ?? `Could not update ${sourceSpec}.`,
		{
			phase: "acquisition",
			diagnostics: diagnostics.map(normalizeExtensionLifecycleDiagnostic),
			completed: {},
		},
	);
}

function activationPreflightFailure(
	diagnostics: readonly ActivationDiagnostic[],
	sourceAcquisitionCompleted: boolean,
) {
	return failure(
		"ns-extension-update-preflight-failed",
		"Extension update activation preflight failed.",
		{
			phase: "preflight",
			diagnostics: diagnostics.map(normalizeExtensionLifecycleDiagnostic),
			sourceAcquisitionCompleted,
			completed: {},
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
		default:
			return assertNever(acquisition);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unexpected extension update acquisition state: ${JSON.stringify(value)}`);
}

export function renderUpdateExtensionHuman(result: UpdateExtensionResult): string {
	return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; acquisition ${result.acquisitionOutcome}; exact prospective effects ${result.prospectiveEffects}.`;
}
