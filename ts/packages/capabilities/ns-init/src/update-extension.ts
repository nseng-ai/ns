import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import { planDeclaredExtensionTarget } from "@nseng-ai/kernel/project-config";
import { z } from "zod";

import {
	activationCompletedSchema,
	applyNsActivation,
	prepareNsActivation,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type { ExtensionUpdateAcquisitionGateway } from "./extension-acquisition.ts";
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
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses, source } =
		preflight.prepared;
	const target = planDeclaredExtensionTarget({
		projectRoot: repoRoot,
		source: nsTomlContent,
		requestedSpec: request.source,
	});
	if (!target.ok) {
		return failure(`ns-extension-update-${target.reason}`, target.message, {
			phase: "preflight",
			...target,
			completed: {},
		});
	}
	const intent =
		source.kind === "local"
			? "local-in-place"
			: source.isPinned
				? "ensure-pinned"
				: "refresh-floating";
	const acquisition = request.dryRun
		? await context.updateAcquisition.preview({ repoRoot, sourceSpec: target.matchedSpec })
		: await context.updateAcquisition.reconcile({ repoRoot, sourceSpec: target.matchedSpec });
	if (!acquisition.isOk) {
		return failure(
			"ns-extension-update-acquisition-failed",
			acquisition.diagnostics[0]?.message ?? `Could not update ${target.matchedSpec}.`,
			{
				phase: "acquisition",
				diagnostics: acquisition.diagnostics.map(normalizeExtensionLifecycleDiagnostic),
				completed: {},
			},
		);
	}
	let completed: UpdateExtensionResult["completed"] = { files: {} };
	if (acquisition.moduleRoot !== undefined) {
		const prepared = await prepareNsActivation(context, {
			repository,
			harnesses,
			harnessSource: "ns-toml",
			nsTomlContent,
			nsTomlChange: "unchanged",
			nsTomlExpected: { type: "file", content: nsTomlContent },
		});
		if (prepared.type === "preflight-failed")
			return failure(
				"ns-extension-update-preflight-failed",
				"Extension update activation preflight failed.",
				{
					phase: "preflight",
					diagnostics: prepared.diagnostics.map(normalizeExtensionLifecycleDiagnostic),
					sourceAcquisitionCompleted: !request.dryRun,
					completed: {},
				},
			);
		if (!request.dryRun) {
			const applied = await applyNsActivation(context, prepared.activation);
			if (applied.type === "apply-failed")
				return failure("ns-extension-update-apply-failed", applied.error.message, {
					phase: applied.phase,
					error: normalizeExtensionLifecycleDiagnostic(applied.error),
					completed: applied.completed,
				});
			completed = applied.completed;
		}
	}
	const sourceKind = source.kind;
	return ok({
		sourceSpec: target.matchedSpec,
		sourceKind,
		mode: request.dryRun ? "dry-run" : "applied",
		acquisitionIntent: intent,
		acquisitionOutcome: request.dryRun
			? "planned"
			: sourceKind === "local"
				? "not-applicable"
				: acquisition.hasExistingSource
					? source.kind === "npm" && source.isPinned
						? "unchanged"
						: "refreshed"
					: "restored",
		prospectiveEffects:
			sourceKind === "npm" && (!source.isPinned || !acquisition.hasExistingSource)
				? "unavailable"
				: "available",
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed,
	});
}

export function renderUpdateExtensionHuman(result: UpdateExtensionResult): string {
	return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; acquisition ${result.acquisitionOutcome}; exact prospective effects ${result.prospectiveEffects}.`;
}
