import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import { ALL_HARNESS_IDS, parseNsTomlHarnesses } from "@nseng-ai/harness-artifacts/api";
import {
	gitExtensionSourceUnsupportedMessage,
	parseExtensionSourceSpec,
} from "@nseng-ai/kernel/extensions/acquisition";
import {
	extensionSourceIdentity,
	planDeclaredExtensionUninstallToml,
} from "@nseng-ai/kernel/project-config";
import { z } from "zod";

import {
	activationCompletedSchema,
	activationRepositoryFailureDiagnostic,
	activationRepositoryFailureType,
	applyNsActivation,
	prepareNsActivation,
	resolveActivationRepository,
	type ActivationDiagnostic,
	type ResolveActivationRepositoryResult,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type { ExtensionUninstallAcquisitionGateway } from "./extension-acquisition.ts";

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
	wasDeclared: z.boolean(),
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
	const repositoryResult = await resolveActivationRepository(context, request.cwd);
	if (repositoryResult.type !== "resolved") return repositoryFailure(repositoryResult);
	const { repoRoot, trunkBranch } = repositoryResult.repository;
	const configRead = await context.files.readActivationFile({ repoRoot, file: "ns-toml" });
	if (configRead.type !== "found") return configReadFailure(configRead, repoRoot);

	const harnesses = parseNsTomlHarnesses(configRead.content);
	if (harnesses.type !== "ok") {
		const diagnostic =
			harnesses.type === "missing"
				? { code: "harnesses-missing", message: "ns.toml does not configure project harnesses." }
				: harnesses.error;
		return failure(
			harnesses.type === "missing"
				? "ns-extension-uninstall-harnesses-missing"
				: "ns-extension-uninstall-harnesses-invalid",
			`${diagnostic.message} Run ns init with an explicit harness before uninstalling extensions.`,
			{
				...preflightFailureEnvelope([{ ...diagnostic, path: "ns.toml" }]),
				nextCommand: "ns init --harness <claude-code|codex|pi>",
			},
		);
	}

	const parsedSource = parseExtensionSourceSpec(repoRoot, request.source);
	if (!parsedSource.ok) {
		return failure(
			"ns-extension-uninstall-source-invalid",
			parsedSource.error.message,
			preflightFailureEnvelope([parsedSource.error]),
		);
	}
	if (parsedSource.value.kind === "git") {
		return unsupportedSource(request.source, gitExtensionSourceUnsupportedMessage(request.source));
	}
	const identity = extensionSourceIdentity(repoRoot, request.source);
	if (identity === undefined) return unsupportedSource(request.source);

	const declaration = planDeclaredExtensionUninstallToml({
		projectRoot: repoRoot,
		source: configRead.content,
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
		if (declaration.reason === "invalid-source") return unsupportedSource(request.source);
		return failure(
			"ns-extension-uninstall-config-invalid",
			declaration.message,
			preflightFailureEnvelope([
				{ code: declaration.reason, message: declaration.message, path: "ns.toml" },
			]),
		);
	}

	const prepared = await prepareNsActivation(context, {
		repository: repositoryResult.repository,
		harnesses: harnesses.harnesses,
		harnessSource: "ns-toml",
		nsTomlContent: declaration.text,
		nsTomlChange: declaration.isRemoved ? "replaced" : "unchanged",
		nsTomlExpected: { type: "file", content: configRead.content },
	});
	if (prepared.type === "preflight-failed") {
		return failure(
			"ns-extension-uninstall-preflight-failed",
			"Extension uninstall preflight failed; no project files or managed packages were changed.",
			preflightFailureEnvelope(prepared.diagnostics),
		);
	}

	const applied = await applyNsActivation(context, prepared.activation);
	if (applied.type === "apply-failed") {
		return failure("ns-extension-uninstall-apply-failed", applied.error.message, {
			phase: applied.phase,
			error: normalizeDiagnostic(applied.error),
			completed: applied.completed,
		});
	}

	let cleanup: UninstallExtensionResult["cleanup"];
	if (parsedSource.value.kind === "local") {
		cleanup = { status: "not-applicable" };
	} else {
		const removed = await context.uninstallAcquisition.removeManagedNpmPackage({
			repoRoot,
			packageName: parsedSource.value.packageName,
		});
		if (!removed.ok) {
			return failure(
				"ns-extension-uninstall-managed-package-cleanup-failed",
				removed.error.message,
				{
					phase: "managed-package-cleanup",
					diagnostic: normalizeDiagnostic(removed.error),
					...(removed.error.path === undefined ? {} : { path: removed.error.path }),
					completed: applied.completed,
				},
			);
		}
		cleanup = { status: removed.value.status, path: removed.value.path };
	}

	return ok({
		sourceSpec: request.source,
		sourceKind: identity.kind,
		sourceIdentity: identity.value,
		...(declaration.matchedSpec === undefined
			? {}
			: { matchedDeclarationSpec: declaration.matchedSpec }),
		wasDeclared: declaration.isRemoved,
		nsTomlPath: join(repoRoot, "ns.toml"),
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses.harnesses],
		completed: applied.completed,
		cleanup,
	});
}

export function renderUninstallExtensionHuman(result: UninstallExtensionResult): string {
	const declaration = result.wasDeclared
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

function preflightFailureEnvelope(diagnostics: readonly ActivationDiagnostic[]) {
	return {
		phase: "preflight" as const,
		diagnostics: normalizeDiagnostics(diagnostics),
		completed: {},
	};
}

function normalizeDiagnostics<T extends { readonly code: string }>(diagnostics: readonly T[]) {
	return diagnostics.map(normalizeDiagnostic);
}

function normalizeDiagnostic<T extends { readonly code: string }>(diagnostic: T) {
	return { ...diagnostic, code: diagnostic.code.replaceAll("_", "-") };
}

function unsupportedSource(
	source: string,
	canonicalMessage?: string,
): ClinkrExit<UninstallExtensionResult> {
	return failure(
		"ns-extension-uninstall-source-unsupported",
		canonicalMessage ??
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
): ClinkrExit<UninstallExtensionResult> {
	if (result.type === "error") {
		return failure(
			"ns-extension-uninstall-config-invalid",
			result.error.message,
			preflightFailureEnvelope([{ ...result.error, path: "ns.toml" }]),
		);
	}
	const message =
		result.type === "missing"
			? "ns.toml is missing; initialize ns before uninstalling extensions."
			: "ns.toml exists but is not a file.";
	return failure("ns-extension-uninstall-harnesses-missing", message, {
		phase: "preflight",
		diagnostics: [{ code: `ns-toml-${result.type}`, message, path: join(repoRoot, "ns.toml") }],
		nextCommand: "ns init --harness <claude-code|codex|pi>",
		completed: {},
	});
}

function repositoryFailure(
	result: Exclude<ResolveActivationRepositoryResult, { type: "resolved" }>,
): ClinkrExit<UninstallExtensionResult> {
	const diagnostic = activationRepositoryFailureDiagnostic(result);
	const errorType = activationRepositoryFailureType(result, {
		"not-a-git-repo": "ns-extension-uninstall-not-a-git-repo",
		"trunk-undetectable": "ns-extension-uninstall-trunk-undetectable",
		error: "ns-extension-uninstall-repository-failed",
	});
	return failure(errorType, diagnostic.message, preflightFailureEnvelope([diagnostic]));
}
