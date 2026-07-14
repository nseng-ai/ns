import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import { planDeclaredExtensionInstallToml } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	activationCompletedSchema,
	applyNsActivation,
	prepareNsActivation,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type { ExtensionInstallAcquisitionGateway } from "./extension-acquisition.ts";
import {
	extensionLifecycleFailure,
	extensionLifecyclePreflightEnvelope,
	normalizeExtensionLifecycleDiagnostic,
	normalizeExtensionLifecycleDiagnostics,
	prepareExtensionLifecycle,
} from "./extension-lifecycle-preflight.ts";
import {
	createLifecycleRecorder,
	lifecycleStepSchema,
	recordLifecycleFailure,
	renderLifecycleMarkdown,
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
	recorder.record({ type: "phase", phase: "repository-preflight", status: "started" });
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
		recordLifecycleFailure(recorder, "declaration-planning", {
			code: declaration.reason,
			message: declaration.message,
			path: "ns.toml",
		});
		if (declaration.reason === "identity-conflict") {
			return failure("ns-extension-install-identity-conflict", declaration.message, {
				phase: "preflight",
				requestedSpec: declaration.requestedSpec,
				existingSpecs: [...declaration.existingSpecs],
				identity: declaration.identity,
				completed: {},
				steps: recorder.steps(),
			});
		}
		return failure(
			"ns-extension-install-config-invalid",
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
		action: declaration.isAdded ? "appended" : "unchanged",
	});
	recorder.record({ type: "phase", phase: "declaration-planning", status: "completed" });
	recorder.record({ type: "phase", phase: "acquisition", status: "started" });

	const acquired = await context.installAcquisition.ensure({
		repoRoot,
		sourceSpec: request.source,
	});
	if (!acquired.ok) {
		const diagnostic = acquired.diagnostics[0] ?? {
			code: "acquisition-failed",
			message: `Could not acquire extension ${request.source}.`,
		};
		recordLifecycleFailure(
			recorder,
			"acquisition",
			normalizeExtensionLifecycleDiagnostic(diagnostic),
		);
		return failure("ns-extension-install-acquisition-failed", diagnostic.message, {
			phase: "acquisition",
			diagnostics: normalizeExtensionLifecycleDiagnostics(acquired.diagnostics),
			completed: {},
			steps: recorder.steps(),
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
	recorder.record({ type: "phase", phase: "acquisition", status: "completed" });
	recorder.record({ type: "phase", phase: "activation-preflight", status: "started" });

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
		recordLifecycleFailure(recorder, "activation-preflight", diagnostic);
		return failure(
			"ns-extension-install-preflight-failed",
			"Extension activation preflight failed; no project files were written.",
			extensionLifecyclePreflightEnvelope(prepared.diagnostics, recorder),
		);
	}
	const selected = prepared.activation.descriptors.find(
		(descriptor) => descriptor.spec === request.source,
	);
	if (selected === undefined) {
		const diagnostic = {
			code: "extension-descriptor-not-selected",
			message: `No validated descriptor was selected for ${request.source}.`,
		};
		recordLifecycleFailure(recorder, "activation-preflight", diagnostic);
		return failure(
			"ns-extension-install-preflight-failed",
			`The acquired extension descriptor was not selected for ${request.source}.`,
			extensionLifecyclePreflightEnvelope([diagnostic], recorder),
		);
	}
	recorder.record({ type: "phase", phase: "activation-preflight", status: "completed" });
	recorder.record({ type: "phase", phase: "activation-apply", status: "started" });
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		recordLifecycleFailure(recorder, "activation-apply", applied.error);
		return failure("ns-extension-install-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: normalizeExtensionLifecycleDiagnostic(applied.error),
			completed: applied.completed,
			steps: recorder.steps(),
		});
	}
	recorder.record({ type: "phase", phase: "activation-apply", status: "completed" });
	recorder.record({ type: "phase", phase: "completion", status: "completed" });
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
