import { join } from "node:path";

import { failure, type ClinkrExit } from "@nseng-ai/clinkr";
import { parseNsTomlHarnesses } from "@nseng-ai/harness-artifacts/api";
import {
	classifyExtensionSourceLifecycle,
	extensionSourceIdentityFromParsed,
	type ExtensionSourceIdentity,
	type ExtensionSourceSpec,
} from "@nseng-ai/kernel/project-config";

import {
	activationRepositoryFailureDiagnostic,
	activationRepositoryFailureType,
	resolveActivationRepository,
	type ActivationDiagnostic,
	type ResolvedActivationRepository,
	type ResolveActivationRepositoryResult,
} from "./activate-ns.ts";
import type { NsActivationContext } from "./activation-context.ts";

export type ExtensionLifecycleVerb = "install" | "uninstall" | "update";

type NonGitExtensionSource = Exclude<ExtensionSourceSpec, { kind: "git" }>;

export interface PreparedExtensionLifecycle {
	readonly repository: ResolvedActivationRepository;
	readonly repoRoot: string;
	readonly trunkBranch: string;
	readonly nsTomlContent: string;
	readonly harnesses: readonly ("claude-code" | "codex" | "pi")[];
	readonly source: NonGitExtensionSource;
	readonly sourceIdentity: ExtensionSourceIdentity;
}

export type ExtensionLifecyclePreflightFailure =
	| {
			readonly type: "repository";
			readonly result: Exclude<ResolveActivationRepositoryResult, { type: "resolved" }>;
	  }
	| {
			readonly type: "config-read";
			readonly result: Exclude<
				Awaited<ReturnType<NsActivationContext["files"]["readActivationFile"]>>,
				{ type: "found" }
			>;
			readonly repoRoot: string;
	  }
	| { readonly type: "harnesses-missing"; readonly diagnostic: ActivationDiagnostic }
	| { readonly type: "harnesses-invalid"; readonly diagnostic: ActivationDiagnostic }
	| { readonly type: "source-invalid"; readonly diagnostic: ActivationDiagnostic }
	| { readonly type: "source-unsupported"; readonly sourceSpec: string; readonly message: string };

export type ExtensionLifecyclePreflightResult =
	| { readonly type: "prepared"; readonly prepared: PreparedExtensionLifecycle }
	| { readonly type: "failed"; readonly failure: ExtensionLifecyclePreflightFailure };

export async function prepareExtensionLifecycle(
	context: NsActivationContext,
	request: { readonly cwd: string; readonly source: string },
): Promise<ExtensionLifecyclePreflightResult> {
	const repository = await resolveActivationRepository(context, request.cwd);
	if (repository.type !== "resolved")
		return { type: "failed", failure: { type: "repository", result: repository } };
	const { repoRoot, trunkBranch } = repository.repository;
	const config = await context.files.readActivationFile({ repoRoot, file: "ns-toml" });
	if (config.type !== "found")
		return { type: "failed", failure: { type: "config-read", result: config, repoRoot } };
	const harnesses = parseNsTomlHarnesses(config.content);
	if (harnesses.type !== "ok") {
		const diagnostic =
			harnesses.type === "missing"
				? {
						code: "harnesses-missing",
						message: "ns.toml does not configure project harnesses.",
						path: "ns.toml",
					}
				: { ...harnesses.error, path: "ns.toml" };
		return {
			type: "failed",
			failure: {
				type: harnesses.type === "missing" ? "harnesses-missing" : "harnesses-invalid",
				diagnostic,
			},
		};
	}
	const classification = classifyExtensionSourceLifecycle(repoRoot, request.source);
	switch (classification.type) {
		case "supported-npm":
		case "supported-local":
			return {
				type: "prepared",
				prepared: {
					repository: repository.repository,
					repoRoot,
					trunkBranch,
					nsTomlContent: config.content,
					harnesses: harnesses.harnesses,
					source: classification.source,
					sourceIdentity: extensionSourceIdentityFromParsed(repoRoot, classification.source),
				},
			};
		case "invalid-npm":
			return {
				type: "failed",
				failure: { type: "source-invalid", diagnostic: classification.diagnostic },
			};
		case "unsupported-git":
			return {
				type: "failed",
				failure: {
					type: "source-unsupported",
					sourceSpec: classification.source.raw,
					message: classification.message,
				},
			};
		case "unsupported-other":
			return {
				type: "failed",
				failure: {
					type: "source-unsupported",
					sourceSpec: classification.sourceSpec,
					message: classification.message,
				},
			};
	}
}

function extensionLifecycleGerund(verb: ExtensionLifecycleVerb): string {
	if (verb === "install") return "installing";
	if (verb === "uninstall") return "uninstalling";
	return "updating";
}

export function extensionLifecycleFailure<TResult>(
	verb: ExtensionLifecycleVerb,
	preflightFailure: ExtensionLifecyclePreflightFailure,
): ClinkrExit<TResult> {
	const prefix = `ns-extension-${verb}`;
	if (preflightFailure.type === "repository") {
		const diagnostic = activationRepositoryFailureDiagnostic(preflightFailure.result);
		const errorType = activationRepositoryFailureType(preflightFailure.result, {
			"not-a-git-repo": `${prefix}-not-a-git-repo`,
			"trunk-undetectable": `${prefix}-trunk-undetectable`,
			error: `${prefix}-repository-failed`,
		});
		return failure(
			errorType,
			diagnostic.message,
			extensionLifecyclePreflightEnvelope([diagnostic]),
		);
	}
	if (preflightFailure.type === "config-read") {
		const { result, repoRoot } = preflightFailure;
		if (result.type === "error") {
			return failure(
				`${prefix}-config-invalid`,
				result.error.message,
				extensionLifecyclePreflightEnvelope([{ ...result.error, path: "ns.toml" }]),
			);
		}
		const message =
			result.type === "missing"
				? `ns.toml is missing; initialize ns before ${extensionLifecycleGerund(verb)} extensions.`
				: "ns.toml exists but is not a file.";
		return failure(`${prefix}-harnesses-missing`, message, {
			phase: "preflight",
			diagnostics: [{ code: `ns-toml-${result.type}`, message, path: join(repoRoot, "ns.toml") }],
			nextCommand: "ns init --harness <claude-code|codex|pi>",
			completed: {},
		});
	}
	if (
		preflightFailure.type === "harnesses-missing" ||
		preflightFailure.type === "harnesses-invalid"
	) {
		return failure(
			`${prefix}-${preflightFailure.type}`,
			`${preflightFailure.diagnostic.message} Run ns init with an explicit harness before ${extensionLifecycleGerund(verb)} extensions.`,
			{
				...extensionLifecyclePreflightEnvelope([preflightFailure.diagnostic]),
				nextCommand: "ns init --harness <claude-code|codex|pi>",
			},
		);
	}
	if (preflightFailure.type === "source-invalid") {
		return failure(
			`${prefix}-source-invalid`,
			preflightFailure.diagnostic.message,
			extensionLifecyclePreflightEnvelope([preflightFailure.diagnostic]),
		);
	}
	return failure(`${prefix}-source-unsupported`, preflightFailure.message, {
		phase: "preflight",
		sourceSpec: preflightFailure.sourceSpec,
		completed: {},
	});
}

export function normalizeExtensionLifecycleDiagnostic<T extends { readonly code: string }>(
	diagnostic: T,
): Omit<T, "code"> & { readonly code: string } {
	return { ...diagnostic, code: diagnostic.code.replaceAll("_", "-") };
}

export function normalizeExtensionLifecycleDiagnostics<T extends { readonly code: string }>(
	diagnostics: readonly T[],
): readonly (Omit<T, "code"> & { readonly code: string })[] {
	return diagnostics.map(normalizeExtensionLifecycleDiagnostic);
}

export function extensionLifecyclePreflightEnvelope<T extends { readonly code: string }>(
	diagnostics: readonly T[],
) {
	return {
		phase: "preflight" as const,
		diagnostics: normalizeExtensionLifecycleDiagnostics(diagnostics),
		completed: {},
	};
}
