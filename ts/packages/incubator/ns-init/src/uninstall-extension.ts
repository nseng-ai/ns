import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import { planDeclaredExtensionUninstallToml } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import { applyNsActivation, prepareNsActivation } from "./activate-ns.ts";
import { activationCompletedSchema } from "./activation-outcomes.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type { ExtensionUninstallAcquisitionGateway } from "./extension-acquisition.ts";
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
	function tracedFailure<TData extends object>(options: {
		readonly diagnostic: LifecycleDiagnostic;
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): ClinkrExit<UninstallExtensionResult> {
		recorder.fail(options.diagnostic);
		return failure(options.errorType, options.message, {
			...options.data,
			steps: recorder.steps(),
		});
	}

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
		const diagnostic = {
			code: declaration.reason,
			message: declaration.message,
			path: "ns.toml",
		};
		if (declaration.reason === "ambiguous-identity") {
			return tracedFailure({
				diagnostic,
				errorType: "ns-extension-uninstall-ambiguous-identity",
				message: declaration.message,
				data: {
					phase: "preflight",
					requestedSpec: declaration.requestedSpec,
					matchingSpecs: [...declaration.matchingSpecs],
					identity: declaration.identity,
					completed: {},
				},
			});
		}
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-uninstall-config-invalid",
			message: declaration.message,
			data: {
				phase: "preflight",
				diagnostics: normalizeExtensionDiagnostics([diagnostic]),
				completed: {},
			},
		});
	}
	recorder.record({
		type: "declaration-decided",
		sourceSpec: request.source,
		nsTomlPath: join(repoRoot, "ns.toml"),
		action: declaration.isRemoved ? "removed" : "absent",
	});
	recorder.beginPhase("activation-preflight");
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
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-uninstall-preflight-failed",
			message:
				"Extension uninstall preflight failed; no project files or managed packages were changed.",
			data: {
				phase: "preflight",
				diagnostics: normalizeExtensionDiagnostics(prepared.diagnostics),
				completed: {},
			},
		});
	}
	recorder.beginPhase("activation-apply");
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		return tracedFailure({
			diagnostic: applied.error,
			errorType: "ns-extension-uninstall-apply-failed",
			message: applied.error.message,
			data: {
				phase: applied.phase,
				error: normalizeExtensionDiagnostic(applied.error),
				completed: applied.completed,
			},
		});
	}
	recorder.endPhase();
	recorder.record({ type: "preservation", subject: "consumer-data" });

	let cleanup: UninstallExtensionResult["cleanup"];
	if (source.kind === "local") {
		cleanup = { status: "not-applicable" };
		recorder.record({ type: "preservation", subject: "local-source", path: source.path });
		recorder.skipPhase("managed-package-cleanup");
		recorder.record({
			type: "acquisition-decided",
			sourceSpec: request.source,
			sourceKind: "local",
			intent: "local-in-place",
			outcome: "not-applicable",
			moduleRoot: source.path,
		});
	} else {
		recorder.beginPhase("managed-package-cleanup");
		const removed = await context.uninstallAcquisition.removeManagedNpmPackage({
			repoRoot,
			packageName: source.packageName,
		});
		if (!removed.ok) {
			const diagnostic = normalizeExtensionDiagnostic(removed.error);
			return tracedFailure({
				diagnostic,
				errorType: "ns-extension-uninstall-managed-package-cleanup-failed",
				message: removed.error.message,
				data: {
					phase: "managed-package-cleanup",
					diagnostic,
					...(removed.error.path === undefined ? {} : { path: removed.error.path }),
					completed: applied.completed,
				},
			});
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
	}
	recorder.complete();
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
