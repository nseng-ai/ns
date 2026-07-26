import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "../harness-artifacts/api.ts";
import { planDeclaredExtensionInstallToml } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import { applyNsActivation, prepareNsActivation } from "./activate-ns.ts";
import { activationCompletedSchema } from "./activation-outcomes.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type { ExtensionInstallAcquisitionGateway } from "./extension-acquisition.ts";
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

export interface ExtensionInstallContext extends NsActivationContext {
	readonly installAcquisition: ExtensionInstallAcquisitionGateway;
}

export const installExtensionRequestSchema = z.object({
	source: z
		.string()
		.min(1)
		.describe("npm: package spec or unprefixed local extension package path."),
});

export const installExtensionResultSchema = z.object({
	sourceSpec: z.string(),
	sourceKind: z.enum(["local", "npm"]),
	packageName: z.string(),
	packageVersion: z.string(),
	moduleRoot: z.string(),
	nsTomlPath: z.string(),
	isRecorded: z.boolean(),
	repoRoot: z.string(),
	trunkBranch: z.string(),
	harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
	completed: activationCompletedSchema,
	steps: z.array(lifecycleStepSchema).readonly(),
});

export type InstallExtensionRequest = z.infer<typeof installExtensionRequestSchema> & {
	readonly cwd: string;
};
export type InstallExtensionResult = z.infer<typeof installExtensionResultSchema>;

export async function installExtension(
	context: ExtensionInstallContext,
	request: InstallExtensionRequest,
): Promise<ClinkrExit<InstallExtensionResult>> {
	const recorder = createLifecycleRecorder(context.lifecycleTrace);
	function tracedFailure<TData extends object>(options: {
		readonly diagnostic: LifecycleDiagnostic;
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): ClinkrExit<InstallExtensionResult> {
		recorder.fail(options.diagnostic);
		return failure(options.errorType, options.message, {
			...options.data,
			steps: recorder.steps(),
		});
	}

	const preflight = await prepareExtensionLifecycle(context, request, recorder);
	if (preflight.type === "failed")
		return extensionLifecycleFailure("install", preflight.failure, recorder);
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses } = preflight.prepared;

	const declaration = planDeclaredExtensionInstallToml({
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
		if (declaration.reason === "identity-conflict") {
			return tracedFailure({
				diagnostic,
				errorType: "ns-extension-install-identity-conflict",
				message: declaration.message,
				data: {
					phase: "preflight",
					requestedSpec: declaration.requestedSpec,
					existingSpecs: [...declaration.existingSpecs],
					identity: declaration.identity,
					completed: {},
				},
			});
		}
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-install-config-invalid",
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
		action: declaration.isAdded ? "appended" : "unchanged",
	});
	recorder.beginPhase("acquisition");

	const acquired = await context.installAcquisition.ensure({
		repoRoot,
		sourceSpec: request.source,
	});
	if (!acquired.ok) {
		const diagnostic = acquired.diagnostics[0] ?? {
			code: "acquisition-failed",
			message: `Could not acquire extension ${request.source}.`,
		};
		return tracedFailure({
			diagnostic: normalizeExtensionDiagnostic(diagnostic),
			errorType: "ns-extension-install-acquisition-failed",
			message: diagnostic.message,
			data: {
				phase: "acquisition",
				diagnostics: normalizeExtensionDiagnostics(acquired.diagnostics),
				completed: {},
			},
		});
	}
	recorder.record({
		type: "acquisition-decided",
		sourceSpec: request.source,
		sourceKind: acquired.sourceKind,
		intent: acquired.sourceKind === "local" ? "local-in-place" : "install",
		outcome: acquired.outcome,
		moduleRoot: acquired.moduleRoot,
	});
	recorder.beginPhase("activation-preflight");

	const prepared = await prepareNsActivation(
		context,
		{
			repository,
			harnesses,
			harnessSource: "ns-toml",
			nsTomlContent: declaration.text,
			nsTomlChange: declaration.isAdded ? "appended" : "unchanged",
			nsTomlExpected: { type: "file", content: nsTomlContent },
		},
		recorder,
	);
	if (prepared.type === "preflight-failed") {
		const diagnostic = prepared.diagnostics[0] ?? {
			code: "activation-preflight-failed",
			message: "Extension activation preflight failed.",
		};
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-install-preflight-failed",
			message: "Extension activation preflight failed; no project files were written.",
			data: {
				phase: "preflight",
				diagnostics: normalizeExtensionDiagnostics(prepared.diagnostics),
				completed: {},
			},
		});
	}
	const selected = prepared.activation.descriptors.find(
		(descriptor) => descriptor.spec === request.source,
	);
	if (selected === undefined) {
		const diagnostic = {
			code: "extension-descriptor-not-selected",
			message: `No validated descriptor was selected for ${request.source}.`,
		};
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-install-preflight-failed",
			message: `The acquired extension descriptor was not selected for ${request.source}.`,
			data: {
				phase: "preflight",
				diagnostics: normalizeExtensionDiagnostics([diagnostic]),
				completed: {},
			},
		});
	}
	recorder.beginPhase("activation-apply");
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		return tracedFailure({
			diagnostic: applied.error,
			errorType: "ns-extension-install-apply-failed",
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
		sourceSpec: request.source,
		sourceKind: selected.sourceKind,
		packageName: selected.packageName,
		packageVersion: selected.version,
		moduleRoot: selected.moduleRoot,
		nsTomlPath: join(repoRoot, "ns.toml"),
		isRecorded: declaration.isAdded,
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed: applied.completed,
		steps: recorder.steps(),
	});
}

export function renderInstallExtensionMarkdown(result: InstallExtensionResult): string {
	return renderLifecycleMarkdown(
		"ns extension install",
		`Installed ${result.packageName}@${result.packageVersion}.`,
		result.steps,
	);
}

export function renderInstallExtensionHuman(result: InstallExtensionResult): string {
	const declaration = result.isRecorded ? "recorded in" : "already present in";
	const artifactCount = result.completed.artifacts?.length ?? 0;
	const outcome = result.isRecorded ? "Installed" : "Ensured already-present";
	return [
		`${outcome} ${result.packageName}@${result.packageVersion} from ${result.sourceSpec}.`,
		`Module root: ${result.moduleRoot}`,
		`Declaration: ${declaration} ${result.nsTomlPath}`,
		`Activated ${artifactCount} artifact${artifactCount === 1 ? "" : "s"} for ${result.harnesses.join(", ")}.`,
	].join("\n");
}
