import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS, parseNsTomlHarnesses } from "@nseng-ai/harness-artifacts/api";
import { parseExtensionSourceSpec } from "@nseng-ai/kernel/extensions/acquisition";
import { planDeclaredExtensionInstallToml } from "@nseng-ai/kernel/project-config";
import { z } from "zod";

import {
	activationCompletedSchema,
	activationRepositoryFailureDiagnostic,
	applyNsActivation,
	prepareNsActivation,
	resolveActivationRepository,
	type ResolveActivationRepositoryResult,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type { ExtensionInstallAcquisitionGateway } from "./extension-acquisition.ts";

export interface ExtensionInstallContext extends NsActivationContext {
	readonly acquisition: ExtensionInstallAcquisitionGateway;
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
});

export type InstallExtensionRequest = z.infer<typeof installExtensionRequestSchema> & {
	readonly cwd: string;
};
export type InstallExtensionResult = z.infer<typeof installExtensionResultSchema>;

export async function installExtension(
	context: ExtensionInstallContext,
	request: InstallExtensionRequest,
): Promise<ClinkrExit<InstallExtensionResult>> {
	const repositoryResult = await resolveActivationRepository(context, request.cwd);
	if (repositoryResult.type !== "resolved") return repositoryFailure(repositoryResult);
	const { repoRoot, trunkBranch } = repositoryResult.repository;
	const configRead = await context.files.readActivationFile({ repoRoot, file: "ns-toml" });
	if (configRead.type !== "found") return configReadFailure(configRead, repoRoot);

	const harnesses = parseNsTomlHarnesses(configRead.content);
	if (harnesses.type !== "ok") {
		const diagnostic =
			harnesses.type === "missing"
				? {
						code: "harnesses-missing",
						message: "ns.toml does not configure project harnesses.",
					}
				: harnesses.error;
		return failure(
			harnesses.type === "missing"
				? "ns-extension-install-harnesses-missing"
				: "ns-extension-install-harnesses-invalid",
			`${diagnostic.message} Run ns init with an explicit harness before installing extensions.`,
			{
				...preflightFailureEnvelope([{ ...diagnostic, path: "ns.toml" }]),
				nextCommand: "ns init --harness <claude-code|codex|pi>",
			},
		);
	}

	const parsedSource = parseExtensionSourceSpec(repoRoot, request.source);
	if (!parsedSource.ok) {
		return failure(
			"ns-extension-install-source-invalid",
			parsedSource.error.message,
			preflightFailureEnvelope([parsedSource.error]),
		);
	}
	if (parsedSource.value.kind === "git") {
		return unsupportedSource(request.source);
	}

	const declaration = planDeclaredExtensionInstallToml({
		projectRoot: repoRoot,
		source: configRead.content,
		requestedSpec: request.source,
	});
	if (!declaration.ok) {
		if (declaration.reason === "identity-conflict") {
			return failure("ns-extension-install-identity-conflict", declaration.message, {
				phase: "preflight",
				requestedSpec: declaration.requestedSpec,
				existingSpecs: [...declaration.existingSpecs],
				identity: declaration.identity,
				completed: {},
			});
		}
		if (declaration.reason === "invalid-source") return unsupportedSource(request.source);
		return failure(
			"ns-extension-install-config-invalid",
			declaration.message,
			preflightFailureEnvelope([
				{ code: declaration.reason, message: declaration.message, path: "ns.toml" },
			]),
		);
	}

	const acquired = await context.acquisition.ensure({
		repoRoot,
		sourceSpec: request.source,
	});
	if (!acquired.ok) {
		return failure(
			"ns-extension-install-acquisition-failed",
			acquired.diagnostics[0]?.message ?? `Could not acquire extension ${request.source}.`,
			{
				phase: "acquisition",
				diagnostics: normalizeDiagnostics(acquired.diagnostics),
				completed: {},
			},
		);
	}

	const prepared = await prepareNsActivation(context, {
		repository: repositoryResult.repository,
		harnesses: harnesses.harnesses,
		harnessSource: "ns-toml",
		nsTomlContent: declaration.text,
		nsTomlChange: declaration.isAdded ? "appended" : "unchanged",
		nsTomlExpected: { type: "file", content: configRead.content },
	});
	if (prepared.type === "preflight-failed") {
		return failure(
			"ns-extension-install-preflight-failed",
			"Extension activation preflight failed; no project files were written.",
			preflightFailureEnvelope(prepared.diagnostics),
		);
	}
	const selected = prepared.activation.descriptors.find(
		(descriptor) => descriptor.spec === request.source,
	);
	if (selected === undefined) {
		return failure(
			"ns-extension-install-preflight-failed",
			`The acquired extension descriptor was not selected for ${request.source}.`,
			preflightFailureEnvelope([
				{
					code: "extension-descriptor-not-selected",
					message: `No validated descriptor was selected for ${request.source}.`,
				},
			]),
		);
	}

	const applied = await applyNsActivation(context, prepared.activation);
	if (applied.type === "apply-failed") {
		return failure("ns-extension-install-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: normalizeDiagnostic(applied.error),
			completed: applied.completed,
		});
	}
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
		harnesses: [...harnesses.harnesses],
		completed: applied.completed,
	});
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

function preflightFailureEnvelope<T extends { readonly code: string }>(diagnostics: readonly T[]) {
	return {
		phase: "preflight" as const,
		diagnostics: normalizeDiagnostics(diagnostics),
		completed: {},
	};
}

function normalizeDiagnostics<T extends { readonly code: string }>(
	diagnostics: readonly T[],
): readonly (Omit<T, "code"> & { readonly code: string })[] {
	return diagnostics.map(normalizeDiagnostic);
}

function normalizeDiagnostic<T extends { readonly code: string }>(
	diagnostic: T,
): Omit<T, "code"> & { readonly code: string } {
	return { ...diagnostic, code: diagnostic.code.replaceAll("_", "-") };
}

function unsupportedSource(source: string): ClinkrExit<InstallExtensionResult> {
	return failure(
		"ns-extension-install-source-unsupported",
		`Extension source must be an npm: spec or an unprefixed local path: ${source}.`,
		{ phase: "preflight", sourceSpec: source, completed: {} },
	);
}

function configReadFailure(
	result: Exclude<
		Awaited<ReturnType<NsActivationContext["files"]["readActivationFile"]>>,
		{ type: "found" }
	>,
	repoRoot: string,
): ClinkrExit<InstallExtensionResult> {
	if (result.type === "error") {
		return failure(
			"ns-extension-install-config-invalid",
			result.error.message,
			preflightFailureEnvelope([{ ...result.error, path: "ns.toml" }]),
		);
	}
	const message =
		result.type === "missing"
			? "ns.toml is missing; initialize ns before installing extensions."
			: "ns.toml exists but is not a file.";
	return failure("ns-extension-install-harnesses-missing", message, {
		phase: "preflight",
		diagnostics: [{ code: `ns-toml-${result.type}`, message, path: join(repoRoot, "ns.toml") }],
		nextCommand: "ns init --harness <claude-code|codex|pi>",
		completed: {},
	});
}

function repositoryFailure(
	result: Exclude<ResolveActivationRepositoryResult, { type: "resolved" }>,
): ClinkrExit<InstallExtensionResult> {
	const diagnostic = activationRepositoryFailureDiagnostic(result);
	const errorType =
		result.type === "not-a-git-repo"
			? "ns-extension-install-not-a-git-repo"
			: result.type === "trunk-undetectable"
				? "ns-extension-install-trunk-undetectable"
				: "ns-extension-install-repository-failed";
	return failure(errorType, diagnostic.message, preflightFailureEnvelope([diagnostic]));
}
