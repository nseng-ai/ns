import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import { planDeclaredExtensionUninstallToml } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	activationCompletedSchema,
	applyNsActivation,
	prepareNsActivation,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type { ExtensionUninstallAcquisitionGateway } from "./extension-acquisition.ts";
import {
	extensionLifecycleFailure,
	extensionLifecyclePreflightEnvelope,
	normalizeExtensionLifecycleDiagnostic,
	prepareExtensionLifecycle,
} from "./extension-lifecycle-preflight.ts";
import {
	createLifecycleRecorder,
	lifecycleStepSchema,
	recordLifecycleFailure,
	renderLifecycleMarkdown,
} from "./lifecycle-observability.ts";

export interface ExtensionUninstallContext extends NsActivationContext {
	readonly uninstallAcquisition: ExtensionUninstallAcquisitionGateway;
}
export const uninstallExtensionRequestSchema = z.object({
	source: z
		.string()
		.min(1)
		.describe("npm: package spec or unprefixed local extension package path."),
});
const uninstallCleanupSchema = z.object({
	status: z.enum(["removed", "already-absent", "not-applicable"]),
	path: z.string().optional(),
});
export const uninstallExtensionResultSchema = z.object({
	sourceSpec: z.string(),
	sourceKind: z.enum(["local", "npm"]),
	sourceIdentity: z.string(),
	matchedDeclarationSpec: z.string().optional(),
	hasRemovedDeclaration: z.boolean(),
	nsTomlPath: z.string(),
	repoRoot: z.string(),
	trunkBranch: z.string(),
	harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
	completed: activationCompletedSchema,
	cleanup: uninstallCleanupSchema,
	steps: z.array(lifecycleStepSchema).readonly(),
});
export type UninstallExtensionRequest = z.infer<typeof uninstallExtensionRequestSchema> & {
	readonly cwd: string;
};
export type UninstallExtensionResult = z.infer<typeof uninstallExtensionResultSchema>;

export async function uninstallExtension(
	context: ExtensionUninstallContext,
	request: UninstallExtensionRequest,
): Promise<ClinkrExit<UninstallExtensionResult>> {
	const recorder = createLifecycleRecorder(context.lifecycleTrace);
	recorder.record({ type: "phase", phase: "repository-preflight", status: "started" });
	const preflight = await prepareExtensionLifecycle(context, request, recorder);
	if (preflight.type === "failed")
		return extensionLifecycleFailure("uninstall", preflight.failure, recorder);
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses, source, sourceIdentity } =
		preflight.prepared;
	const declaration = planDeclaredExtensionUninstallToml({
		projectRoot: repoRoot,
		nsTomlContent,
		requestedSpec: request.source,
	});
	if (!declaration.ok) {
		recordLifecycleFailure(recorder, "declaration-planning", {
			code: declaration.reason,
			message: declaration.message,
			path: "ns.toml",
		});
		if (declaration.reason === "ambiguous-identity")
			return failure("ns-extension-uninstall-ambiguous-identity", declaration.message, {
				phase: "preflight",
				requestedSpec: declaration.requestedSpec,
				matchingSpecs: [...declaration.matchingSpecs],
				identity: declaration.identity,
				completed: {},
				steps: recorder.steps(),
			});
		return failure(
			"ns-extension-uninstall-config-invalid",
			declaration.message,
			extensionLifecyclePreflightEnvelope(
				[{ code: declaration.reason, message: declaration.message, path: "ns.toml" }],
				recorder,
			),
		);
	}
	recorder.record({
		type: "declaration-decided",
		sourceSpec: request.source,
		nsTomlPath: join(repoRoot, "ns.toml"),
		action: declaration.isRemoved ? "removed" : "absent",
	});
	recorder.record({ type: "phase", phase: "declaration-planning", status: "completed" });
	recorder.record({ type: "phase", phase: "activation-preflight", status: "started" });
	const prepared = await prepareNsActivation(
		context,
		{
			repository,
			harnesses,
			harnessSource: "ns-toml",
			nsTomlContent: declaration.text,
			nsTomlChange: declaration.isRemoved ? "replaced" : "unchanged",
			nsTomlExpected: { type: "file", content: nsTomlContent },
		},
		recorder,
	);
	if (prepared.type === "preflight-failed") {
		const diagnostic = prepared.diagnostics[0] ?? {
			code: "activation-preflight-failed",
			message: "Extension uninstall preflight failed.",
		};
		recordLifecycleFailure(recorder, "activation-preflight", diagnostic);
		return failure(
			"ns-extension-uninstall-preflight-failed",
			"Extension uninstall preflight failed; no project files or managed packages were changed.",
			extensionLifecyclePreflightEnvelope(prepared.diagnostics, recorder),
		);
	}
	recorder.record({ type: "phase", phase: "activation-preflight", status: "completed" });
	recorder.record({ type: "phase", phase: "activation-apply", status: "started" });
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		recordLifecycleFailure(recorder, "activation-apply", applied.error);
		return failure("ns-extension-uninstall-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: normalizeExtensionLifecycleDiagnostic(applied.error),
			completed: applied.completed,
			steps: recorder.steps(),
		});
	}
	recorder.record({ type: "phase", phase: "activation-apply", status: "completed" });
	recorder.record({ type: "preservation", subject: "consumer-data" });

	let cleanup: UninstallExtensionResult["cleanup"];
	if (source.kind === "local") {
		cleanup = { status: "not-applicable" };
		recorder.record({ type: "preservation", subject: "local-source", path: source.path });
		recorder.record({ type: "phase", phase: "managed-package-cleanup", status: "skipped" });
		recorder.record({
			type: "acquisition-decided",
			sourceSpec: request.source,
			sourceKind: "local",
			intent: "local-in-place",
			outcome: "not-applicable",
			moduleRoot: source.path,
		});
	} else {
		recorder.record({ type: "phase", phase: "managed-package-cleanup", status: "started" });
		const removed = await context.uninstallAcquisition.removeManagedNpmPackage({
			repoRoot,
			packageName: source.packageName,
		});
		if (!removed.ok) {
			recordLifecycleFailure(
				recorder,
				"managed-package-cleanup",
				normalizeExtensionLifecycleDiagnostic(removed.error),
			);
			return failure(
				"ns-extension-uninstall-managed-package-cleanup-failed",
				removed.error.message,
				{
					phase: "managed-package-cleanup",
					diagnostic: normalizeExtensionLifecycleDiagnostic(removed.error),
					...(removed.error.path === undefined ? {} : { path: removed.error.path }),
					completed: applied.completed,
					steps: recorder.steps(),
				},
			);
		}
		cleanup = { status: removed.value.status, path: removed.value.path };
		recorder.record({
			type: "acquisition-decided",
			sourceSpec: request.source,
			sourceKind: "npm",
			intent: "remove-managed",
			outcome: removed.value.status,
			managedPath: removed.value.path,
		});
		recorder.record({ type: "phase", phase: "managed-package-cleanup", status: "completed" });
	}
	recorder.record({ type: "phase", phase: "completion", status: "completed" });
	return ok({
		sourceSpec: request.source,
		sourceKind: sourceIdentity.kind,
		sourceIdentity: sourceIdentity.value,
		...(declaration.matchedSpec === undefined
			? {}
			: { matchedDeclarationSpec: declaration.matchedSpec }),
		hasRemovedDeclaration: declaration.isRemoved,
		nsTomlPath: join(repoRoot, "ns.toml"),
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed: applied.completed,
		cleanup,
		steps: recorder.steps(),
	});
}

export function renderUninstallExtensionMarkdown(result: UninstallExtensionResult): string {
	const declaration = result.hasRemovedDeclaration ? "removed" : "already absent";
	const preservation =
		result.sourceKind === "local"
			? "Local source and consumer data were preserved."
			: "Consumer data was preserved.";
	return renderLifecycleMarkdown(
		"ns extension uninstall",
		`Uninstalled ${result.sourceKind}:${result.sourceIdentity}; declaration ${declaration}; managed cleanup ${result.cleanup.status}. ${preservation}`,
		result.steps,
	);
}
export function renderUninstallExtensionHuman(result: UninstallExtensionResult): string {
	const declaration = result.hasRemovedDeclaration
		? `removed ${result.matchedDeclarationSpec ?? result.sourceSpec} from ${result.nsTomlPath}`
		: `no matching declaration was present in ${result.nsTomlPath}`;
	const artifactCount =
		result.completed.artifacts?.filter((item) => item.action === "removed").length ?? 0;
	const cleanup =
		result.cleanup.status === "not-applicable"
			? "Local extension bytes were left untouched."
			: `Managed npm package cleanup: ${result.cleanup.status} at ${result.cleanup.path ?? "unknown path"}.`;
	return [
		`Uninstalled identity ${result.sourceKind}:${result.sourceIdentity}.`,
		`Declaration: ${declaration}.`,
		`Deactivated ${artifactCount} artifact${artifactCount === 1 ? "" : "s"} for ${result.harnesses.join(", ")}.`,
		cleanup,
		"Extension consumer data was preserved.",
	].join("\n");
}
