import { join } from "node:path";

import type { CommandOutcome } from "@nseng-ai/clinkr/app";
import { failure, ok } from "@nseng-ai/clinkr/app";
import { ALL_HARNESS_IDS } from "../harness-artifacts/api.ts";
import { parseUserSupportedHarnessesFacts } from "@nseng-ai/sdk/extensions/user-extension-layer";
import {
	managedNpmPackagePaths,
	planDeclaredExtensionUninstallToml,
	projectManagedNpmStorage,
} from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	completedUserArtifactEvidence,
	extensionLifecycleScopeSchemaValues,
	loadOneUserDescriptor,
	prepareUserConfig,
	prepareUserExtensionSource,
	summarizeUserArtifactActions,
	userArtifactPreflightBlockers,
	type UserExtensionLifecycleContext,
} from "./user-extension-lifecycle.ts";
import type { PrepareUserArtifactActivationResult } from "./user-artifact-activation.ts";

import { applyNsActivation, prepareNsActivation } from "./activate-ns.ts";
import {
	activationCompletedSchema,
	declaredArtifactActivationOutcomeSchema,
} from "./activation-outcomes.ts";
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

export interface ExtensionUninstallContext
	extends NsActivationContext, UserExtensionLifecycleContext {
	readonly uninstallAcquisition: ExtensionUninstallAcquisitionGateway;
}
export const uninstallExtensionRequestSchema = z.object({
	source: z
		.string()
		.min(1)
		.describe("npm: package spec or unprefixed local extension package path."),
	scope: z.enum(extensionLifecycleScopeSchemaValues).default("project"),
});
const uninstallCleanupSchema = z.object({
	status: z.enum(["removed", "already-absent", "not-applicable"]),
	path: z.string().optional(),
});
const uninstallExtensionSourceResultSchema = z.object({
	sourceSpec: z.string(),
	sourceKind: z.enum(["local", "npm"]),
	sourceIdentity: z.string(),
	matchedDeclarationSpec: z.string().optional(),
	hasRemovedDeclaration: z.boolean(),
	configPath: z.string(),
});
export const uninstallExtensionResultSchema = z.discriminatedUnion("scope", [
	uninstallExtensionSourceResultSchema.extend({
		scope: z.literal("project"),
		nsTomlPath: z.string(),
		cleanup: uninstallCleanupSchema,
		repoRoot: z.string(),
		trunkBranch: z.string(),
		harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
		completed: activationCompletedSchema,
		steps: z.array(lifecycleStepSchema).readonly(),
	}),
	uninstallExtensionSourceResultSchema.extend({
		scope: z.literal("user"),
		declarationAction: z.enum(["removed", "already-absent"]),
		activation: z.literal("not-performed"),
		cleanup: uninstallCleanupSchema,
		artifactReconciliation: z.enum([
			"performed",
			"not-authorized-declaration-absent",
			"artifacts-retained-package-identity-unavailable",
		]),
		artifacts: z.array(declaredArtifactActivationOutcomeSchema).readonly(),
	}),
]);
export type UninstallExtensionRequest = z.input<typeof uninstallExtensionRequestSchema> & {
	readonly cwd: string;
};
export type UninstallExtensionResult = z.infer<typeof uninstallExtensionResultSchema>;

export async function uninstallExtension(
	context: ExtensionUninstallContext,
	request: UninstallExtensionRequest,
): Promise<CommandOutcome<UninstallExtensionResult>> {
	if (request.scope === "user") return uninstallUserExtension(context, request);
	const recorder = createLifecycleRecorder(context.lifecycleTrace);
	function tracedFailure<TData extends object>(options: {
		readonly diagnostic: LifecycleDiagnostic;
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): CommandOutcome<UninstallExtensionResult> {
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

	let cleanup: Extract<UninstallExtensionResult, { readonly scope: "project" }>["cleanup"];
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
			storage: projectManagedNpmStorage(repoRoot),
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
		scope: "project",
		sourceSpec: request.source,
		sourceKind: sourceIdentity.kind,
		sourceIdentity: sourceIdentity.value,
		...(declaration.matchedSpec === undefined
			? {}
			: { matchedDeclarationSpec: declaration.matchedSpec }),
		hasRemovedDeclaration: declaration.isRemoved,
		nsTomlPath: join(repoRoot, "ns.toml"),
		configPath: join(repoRoot, "ns.toml"),
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed: applied.completed,
		cleanup,
		steps: recorder.steps(),
	});
}

async function uninstallUserExtension(
	context: ExtensionUninstallContext,
	request: UninstallExtensionRequest,
): Promise<CommandOutcome<UninstallExtensionResult>> {
	const source = prepareUserExtensionSource<UninstallExtensionResult>({
		context,
		cwd: request.cwd,
		source: request.source,
		operation: "uninstall",
	});
	if (!source.ok) return source.exit;
	const prepared = await prepareUserConfig<UninstallExtensionResult>(context, "uninstall");
	if ("status" in prepared) return prepared;
	const supportedHarnesses = parseUserSupportedHarnessesFacts(
		prepared.content,
		prepared.configPath,
	);
	if (supportedHarnesses.type === "invalid")
		return failure("ns-extension-uninstall-user-config-invalid", supportedHarnesses.error.message, {
			scope: "user",
			diagnostics: [supportedHarnesses.error],
		});
	const declaration = planDeclaredExtensionUninstallToml({
		projectRoot: prepared.configDir,
		nsTomlContent: prepared.content,
		requestedSpec: source.sourceSpec,
	});
	if (!declaration.ok)
		return failure(`ns-extension-uninstall-user-${declaration.reason}`, declaration.message, {
			scope: "user",
			...declaration,
		});
	// The package name is the artifact deletion authority. npm sources carry it in
	// the spec; local sources need the descriptor, which may already be gone.
	let targetPackageName: string | undefined;
	if (source.source.kind === "npm") {
		targetPackageName = source.source.packageName;
	} else {
		const loaded = await loadOneUserDescriptor<UninstallExtensionResult>({
			context,
			configDir: prepared.configDir,
			sourceSpec: source.sourceSpec,
			operation: "uninstall",
		});
		targetPackageName = loaded.ok ? loaded.descriptor.packageName : undefined;
	}
	const artifactReconciliation = !declaration.isRemoved
		? ("not-authorized-declaration-absent" as const)
		: targetPackageName === undefined
			? ("artifacts-retained-package-identity-unavailable" as const)
			: ("performed" as const);
	let preparedArtifactRemoval: PrepareUserArtifactActivationResult | undefined;
	if (declaration.isRemoved && targetPackageName !== undefined) {
		preparedArtifactRemoval = await context.userArtifacts.prepare({
			cwd: request.cwd,
			descriptors: [],
			configuredHarnesses: supportedHarnesses.harnesses,
			targetPackageNames: [targetPackageName],
		});
		if (!preparedArtifactRemoval.ok)
			return failure(
				"ns-extension-uninstall-user-artifact-preflight-failed",
				preparedArtifactRemoval.error.message,
				{
					scope: "user",
					declarationCompleted: false,
					diagnostics: [normalizeExtensionDiagnostic(preparedArtifactRemoval.error)],
				},
			);
		const blockers = userArtifactPreflightBlockers(preparedArtifactRemoval.prepared);
		if (blockers.length > 0)
			return failure(
				"ns-extension-uninstall-user-artifact-preflight-failed",
				blockers[0]?.message ?? "User artifact removal preflight failed.",
				{
					scope: "user",
					declarationCompleted: false,
					diagnostics: blockers,
					retainedPaths: blockers.flatMap((blocker) =>
						blocker.path === undefined ? [] : [blocker.path],
					),
				},
			);
	}
	let artifacts: readonly z.infer<typeof declaredArtifactActivationOutcomeSchema>[] = [];
	if (preparedArtifactRemoval?.ok === true) {
		const applied = await context.userArtifacts.apply(preparedArtifactRemoval.prepared);
		if (!applied.ok)
			return failure("ns-extension-uninstall-user-artifact-removal-failed", applied.error.message, {
				scope: "user",
				declarationAction: "removed",
				declarationCompleted: false,
				completedArtifacts: completedUserArtifactEvidence(applied.completed),
				diagnostics: [normalizeExtensionDiagnostic(applied.error)],
				retryGuidance: `The User declaration was retained. Re-run ns extension uninstall --scope user ${source.sourceSpec} to reconcile the remaining artifact transitions and retry declaration removal.`,
			});
		artifacts = completedUserArtifactEvidence(applied.completed);
	}
	if (declaration.isRemoved) {
		const written = await context.userExtensionConfig.compareAndWrite({
			expected: prepared.expected,
			content: declaration.text,
		});
		if (!written.ok)
			return failure("ns-extension-uninstall-user-config-write-failed", written.error.message, {
				scope: "user",
				declarationCompleted: false,
				completedArtifacts: artifacts,
				error: written.error,
				retryGuidance: `The User declaration was retained. Re-run ns extension uninstall --scope user ${source.sourceSpec}; already removed artifacts will reconcile idempotently before declaration removal is retried.`,
			});
	}
	let cleanup: { status: "removed" | "already-absent" | "not-applicable"; path?: string } = {
		status: "not-applicable",
	};
	if (source.source.kind === "npm") {
		if (context.userManagedNpmStorage.type !== "available")
			throw new Error("User npm storage became unavailable after source preparation.");
		const managedPath = managedNpmPackagePaths(
			context.userManagedNpmStorage.storage,
			source.source.packageName,
		).npmProjectRoot;
		const removed = await context.uninstallAcquisition.removeManagedNpmPackage({
			storage: context.userManagedNpmStorage.storage,
			packageName: source.source.packageName,
		});
		if (!removed.ok)
			return failure(
				"ns-extension-uninstall-user-managed-package-cleanup-failed",
				`The user declaration was removed, but managed package cleanup failed: ${removed.error.message}`,
				{
					scope: "user",
					declarationAction: declaration.isRemoved ? "removed" : "already-absent",
					declarationCompleted: true,
					retainedPath: removed.error.path ?? managedPath,
					completedArtifacts: artifacts,
					diagnostic: normalizeExtensionDiagnostic(removed.error),
				},
			);
		cleanup = { status: removed.value.status, path: removed.value.path };
	}
	return ok({
		scope: "user",
		sourceSpec: source.sourceSpec,
		sourceKind: source.source.kind === "npm" ? "npm" : "local",
		sourceIdentity: source.source.kind === "npm" ? source.source.packageName : source.sourceSpec,
		...(declaration.matchedSpec === undefined
			? {}
			: { matchedDeclarationSpec: declaration.matchedSpec }),
		hasRemovedDeclaration: declaration.isRemoved,
		configPath: prepared.configPath,
		declarationAction: declaration.isRemoved ? "removed" : "already-absent",
		activation: "not-performed",
		cleanup,
		artifactReconciliation,
		artifacts,
	});
}

export function renderUninstallExtensionMarkdown(result: UninstallExtensionResult): string {
	if (result.scope === "user")
		return `User declaration ${result.declarationAction} in ${result.configPath}; bundled artifacts: ${summarizeUserArtifactActions(result.artifacts)}${describeSkippedUserArtifactRemoval(result.artifactReconciliation)}; managed cleanup ${result.cleanup.status}; no project deactivation ran.`;
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
	if (result.scope === "user")
		return `User declaration ${result.declarationAction} in ${result.configPath}. Bundled artifacts: ${summarizeUserArtifactActions(result.artifacts)}${describeSkippedUserArtifactRemoval(result.artifactReconciliation)}. Cleanup: ${result.cleanup.status}${result.cleanup.path === undefined ? "" : ` at ${result.cleanup.path}`}; no project deactivation was performed.`;
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

function describeSkippedUserArtifactRemoval(
	outcome: Extract<UninstallExtensionResult, { readonly scope: "user" }>["artifactReconciliation"],
): string {
	switch (outcome) {
		case "performed":
			return "";
		case "not-authorized-declaration-absent":
			return " (retained: declaration already absent, so the argument grants no deletion authority)";
		case "artifacts-retained-package-identity-unavailable":
			return " (artifacts-retained-package-identity-unavailable; inspect user manifests and recover manually after identifying the package owner)";
	}
}
