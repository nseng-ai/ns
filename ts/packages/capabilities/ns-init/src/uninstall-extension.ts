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
});

export type UninstallExtensionRequest = z.infer<typeof uninstallExtensionRequestSchema> & {
	readonly cwd: string;
};
export type UninstallExtensionResult = z.infer<typeof uninstallExtensionResultSchema>;

export async function uninstallExtension(
	context: ExtensionUninstallContext,
	request: UninstallExtensionRequest,
): Promise<ClinkrExit<UninstallExtensionResult>> {
	const preflight = await prepareExtensionLifecycle(context, request);
	if (preflight.type === "failed") return extensionLifecycleFailure("uninstall", preflight.failure);
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses, source, sourceIdentity } =
		preflight.prepared;

	const declaration = planDeclaredExtensionUninstallToml({
		projectRoot: repoRoot,
		nsTomlContent,
		requestedSpec: request.source,
	});
	if (!declaration.ok) {
		if (declaration.reason === "ambiguous-identity") {
			return failure("ns-extension-uninstall-ambiguous-identity", declaration.message, {
				phase: "preflight",
				requestedSpec: declaration.requestedSpec,
				matchingSpecs: [...declaration.matchingSpecs],
				identity: declaration.identity,
				completed: {},
			});
		}
		return failure(
			"ns-extension-uninstall-config-invalid",
			declaration.message,
			extensionLifecyclePreflightEnvelope([
				{ code: declaration.reason, message: declaration.message, path: "ns.toml" },
			]),
		);
	}

	const prepared = await prepareNsActivation(context, {
		repository,
		harnesses,
		harnessSource: "ns-toml",
		nsTomlContent: declaration.text,
		nsTomlChange: declaration.isRemoved ? "replaced" : "unchanged",
		nsTomlExpected: { type: "file", content: nsTomlContent },
	});
	if (prepared.type === "preflight-failed") {
		return failure(
			"ns-extension-uninstall-preflight-failed",
			"Extension uninstall preflight failed; no project files or managed packages were changed.",
			extensionLifecyclePreflightEnvelope(prepared.diagnostics),
		);
	}

	const applied = await applyNsActivation(context, prepared.activation);
	if (applied.type === "apply-failed") {
		return failure("ns-extension-uninstall-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: normalizeExtensionLifecycleDiagnostic(applied.error),
			completed: applied.completed,
		});
	}

	let cleanup: UninstallExtensionResult["cleanup"];
	if (source.kind === "local") {
		cleanup = { status: "not-applicable" };
	} else {
		const removed = await context.uninstallAcquisition.removeManagedNpmPackage({
			repoRoot,
			packageName: source.packageName,
		});
		if (!removed.ok) {
			return failure(
				"ns-extension-uninstall-managed-package-cleanup-failed",
				removed.error.message,
				{
					phase: "managed-package-cleanup",
					diagnostic: normalizeExtensionLifecycleDiagnostic(removed.error),
					...(removed.error.path === undefined ? {} : { path: removed.error.path }),
					completed: applied.completed,
				},
			);
		}
		cleanup = { status: removed.value.status, path: removed.value.path };
	}

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
	});
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
