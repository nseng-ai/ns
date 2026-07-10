import type {
	DeclaredArtifactActivationOutcome,
	HarnessId,
	NsTomlChange,
	PreparedDeclaredArtifactActivation,
} from "@nseng-ai/harness-artifacts/api";
import { parseNsTomlExtensions } from "@nseng-ai/harness-artifacts/api";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";

import type { NsActivationContext } from "./activation-context.ts";
import type {
	ActivationTextFileReadResult,
	ConsumerDirectoryInspectionResult,
} from "./activation-files.ts";
import type { NsInitErrorInfo } from "./error-info.ts";
import {
	applyNsPointerStanza,
	ensureClaudeAgentsImport,
	renderGeneratedInstructions,
} from "./instruction-block.ts";

export interface ResolvedActivationRepository {
	readonly repoRoot: string;
	readonly trunkBranch: string;
}

export type ResolveActivationRepositoryResult =
	| { readonly type: "resolved"; readonly repository: ResolvedActivationRepository }
	| { readonly type: "not-a-git-repo"; readonly message: string; readonly cwd: string }
	| { readonly type: "trunk-undetectable"; readonly message: string; readonly repoRoot: string }
	| { readonly type: "error"; readonly error: NsInitErrorInfo };

export interface ActivationDiagnostic {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
}

export interface FileActivationOutcome {
	readonly change: "created" | "appended" | "replaced" | "unchanged";
}

export interface ConsumerDirectoryOutcome {
	readonly path: string;
	readonly change: "created" | "updated" | "unchanged";
}

export interface ActivationCompleted {
	readonly nsToml?: FileActivationOutcome;
	readonly agentsInstructionFile?: FileActivationOutcome;
	readonly claudeInstructionFile?: FileActivationOutcome;
	readonly generatedInstructionsFile?: FileActivationOutcome;
	readonly consumerDirectories?: readonly ConsumerDirectoryOutcome[];
	readonly artifacts?: readonly DeclaredArtifactActivationOutcome[];
}

interface PreparedFileWrite {
	readonly path: string;
	readonly content: string;
	readonly change: FileActivationOutcome["change"];
}

interface PreparedConsumerDirectory {
	readonly path: string;
	readonly change: ConsumerDirectoryOutcome["change"];
}

export interface PreparedNsActivation {
	readonly repository: ResolvedActivationRepository;
	readonly harnesses: readonly HarnessId[];
	readonly harnessSource: "explicit" | "ns-toml";
	readonly nsToml: PreparedFileWrite;
	readonly agents: PreparedFileWrite;
	readonly claude: PreparedFileWrite;
	readonly instructions: PreparedFileWrite;
	readonly consumerDirectories: readonly PreparedConsumerDirectory[];
	readonly artifacts: PreparedDeclaredArtifactActivation;
}

export type PrepareNsActivationResult =
	| { readonly type: "prepared"; readonly activation: PreparedNsActivation }
	| {
			readonly type: "preflight-failed";
			readonly diagnostics: readonly ActivationDiagnostic[];
			readonly completed: Record<string, never>;
	  };

export type ApplyNsActivationResult =
	| { readonly type: "activated"; readonly completed: ActivationCompleted }
	| {
			readonly type: "apply-failed";
			readonly phase: string;
			readonly error: NsInitErrorInfo;
			readonly completed: ActivationCompleted;
	  };

export interface PrepareNsActivationOptions {
	readonly repository: ResolvedActivationRepository;
	readonly harnesses: readonly HarnessId[];
	readonly harnessSource: "explicit" | "ns-toml";
	readonly nsTomlContent: string;
	readonly nsTomlChange: NsTomlChange;
}

export async function prepareNsActivation(
	context: NsActivationContext,
	options: PrepareNsActivationOptions,
): Promise<PrepareNsActivationResult> {
	const diagnostics: ActivationDiagnostic[] = [];
	const parsedExtensions = parseNsTomlExtensions(options.nsTomlContent);
	if (parsedExtensions.type === "error") {
		diagnostics.push(toActivationDiagnostic(parsedExtensions.error, "ns.toml"));
	}
	const specs = parsedExtensions.type === "ok" ? parsedExtensions.extensions : [];
	const loaded = await context.declaredExtensions.load({
		repoRoot: options.repository.repoRoot,
		specs,
	});
	for (const diagnostic of loaded.diagnostics) {
		diagnostics.push(toActivationDiagnostic(diagnostic));
	}

	const [agentsRead, claudeRead, instructionsRead] = await Promise.all([
		context.files.readTextFile({
			repoRoot: options.repository.repoRoot,
			relativePath: "AGENTS.md",
		}),
		context.files.readTextFile({
			repoRoot: options.repository.repoRoot,
			relativePath: "CLAUDE.md",
		}),
		context.files.readTextFile({
			repoRoot: options.repository.repoRoot,
			relativePath: ".ns/instructions.md",
		}),
	]);
	const agentsText = textForPreflight(agentsRead, "AGENTS.md", diagnostics);
	const claudeText = textForPreflight(claudeRead, "CLAUDE.md", diagnostics);
	textForPreflight(instructionsRead, ".ns/instructions.md", diagnostics);
	const agentsApplied = applyNsPointerStanza({ text: agentsText });
	if (agentsApplied.type === "malformed") {
		diagnostics.push(
			toActivationDiagnostic(
				{ code: "agents-pointer-malformed", message: agentsApplied.reason },
				"AGENTS.md",
			),
		);
	}
	const claudeApplied = ensureClaudeAgentsImport({ text: claudeText });
	const generatedInstructions = renderGeneratedInstructions(
		loaded.descriptors.flatMap((record) =>
			record.descriptor.activation?.instructions === undefined
				? []
				: [record.descriptor.activation.instructions],
		),
	);
	const consumerDirectories = stableConsumerDirectories(loaded.descriptors);
	const preparedConsumerDirectories: PreparedConsumerDirectory[] = [];
	for (const path of consumerDirectories) {
		const inspection = await context.files.inspectConsumerDirectory({
			repoRoot: options.repository.repoRoot,
			relativePath: path,
		});
		const prepared = consumerDirectoryPreflight(path, inspection, diagnostics);
		if (prepared !== undefined) preparedConsumerDirectories.push(prepared);
	}

	const artifactPreparation = await context.artifacts.prepare({
		repoRoot: options.repository.repoRoot,
		descriptors: loaded.descriptors,
		harnesses: options.harnesses,
	});
	if (!artifactPreparation.ok) {
		diagnostics.push(toActivationDiagnostic(artifactPreparation.error));
	} else {
		for (const diagnostic of artifactPreparation.prepared.diagnostics) {
			diagnostics.push(toActivationDiagnostic(diagnostic));
		}
		for (const collision of artifactPreparation.prepared.skippedCollisions) {
			diagnostics.push({
				code: "artifact-collision",
				message: `Artifact ${collision.kind} collision for ${collision.value}: ${collision.packages.join(", ")}.`,
			});
		}
		for (const item of artifactPreparation.prepared.artifacts) {
			if (item.action !== "conflicted") continue;
			diagnostics.push(artifactConflictDiagnostic(item.artifact.id, item.harness));
		}
	}

	if (diagnostics.length > 0 || agentsApplied.type === "malformed" || !artifactPreparation.ok) {
		return { type: "preflight-failed", diagnostics, completed: {} };
	}
	return {
		type: "prepared",
		activation: {
			repository: options.repository,
			harnesses: [...options.harnesses],
			harnessSource: options.harnessSource,
			nsToml: { path: "ns.toml", content: options.nsTomlContent, change: options.nsTomlChange },
			agents: {
				path: "AGENTS.md",
				content: agentsApplied.content,
				change: fileChange(agentsRead, agentsApplied.change),
			},
			claude: {
				path: "CLAUDE.md",
				content: claudeApplied.content,
				change: fileChange(claudeRead, claudeApplied.change),
			},
			instructions: {
				path: ".ns/instructions.md",
				content: generatedInstructions,
				change: generatedFileChange(instructionsRead, generatedInstructions),
			},
			consumerDirectories: preparedConsumerDirectories,
			artifacts: artifactPreparation.prepared,
		},
	};
}

export async function applyNsActivation(
	context: NsActivationContext,
	prepared: PreparedNsActivation,
): Promise<ApplyNsActivationResult> {
	const completed: MutableActivationCompleted = {};
	const fileDuties = [
		["ns-toml", "nsToml", prepared.nsToml],
		["agents-instructions", "agentsInstructionFile", prepared.agents],
		["claude-instructions", "claudeInstructionFile", prepared.claude],
		["generated-instructions", "generatedInstructionsFile", prepared.instructions],
	] as const;
	for (const [phase, field, file] of fileDuties) {
		if (file.change !== "unchanged") {
			const written = await context.files.writeTextFile({
				repoRoot: prepared.repository.repoRoot,
				relativePath: file.path,
				content: file.content,
			});
			if (!written.ok) return { type: "apply-failed", phase, error: written.error, completed };
		}
		completed[field] = { change: file.change };
	}

	const consumerOutcomes: ConsumerDirectoryOutcome[] = [];
	for (const directory of prepared.consumerDirectories) {
		if (directory.change !== "unchanged") {
			const ensured = await context.files.ensureConsumerDirectory({
				repoRoot: prepared.repository.repoRoot,
				relativePath: directory.path,
			});
			if (!ensured.ok) {
				if (consumerOutcomes.length > 0) completed.consumerDirectories = consumerOutcomes;
				return {
					type: "apply-failed",
					phase: "consumer-directories",
					error: ensured.error,
					completed,
				};
			}
		}
		consumerOutcomes.push({ ...directory });
	}
	completed.consumerDirectories = consumerOutcomes;

	const artifacts = await context.artifacts.apply(prepared.artifacts);
	completed.artifacts = structuredClone(artifacts.completed);
	if (!artifacts.ok) {
		return { type: "apply-failed", phase: "artifacts", error: artifacts.error, completed };
	}
	const conflict = artifacts.completed.find((outcome) => outcome.action === "conflicted");
	if (conflict !== undefined) {
		return {
			type: "apply-failed",
			phase: "artifacts",
			error: {
				...artifactConflictDiagnostic(conflict.artifactId, conflict.harness),
				details: { conflictingFiles: [...conflict.conflictingFiles] },
			},
			completed,
		};
	}
	return { type: "activated", completed };
}

type MutableActivationCompleted = {
	-readonly [Key in keyof ActivationCompleted]?: ActivationCompleted[Key];
};

function textForPreflight(
	read: ActivationTextFileReadResult,
	path: string,
	diagnostics: ActivationDiagnostic[],
): string {
	if (read.type === "found") return read.content;
	if (read.type === "missing") return "";
	if (read.type === "not-file") {
		diagnostics.push({
			code: "activation-path-not-file",
			message: `${path} exists but is not a file.`,
			path,
		});
		return "";
	}
	diagnostics.push({ code: read.error.code, message: read.error.message, path });
	return "";
}

function consumerDirectoryPreflight(
	path: string,
	inspection: ConsumerDirectoryInspectionResult,
	diagnostics: ActivationDiagnostic[],
): PreparedConsumerDirectory | undefined {
	if (inspection.type === "missing") return { path, change: "created" };
	if (inspection.type === "not-directory") {
		diagnostics.push({
			code: "consumer-path-not-directory",
			message: `${path} exists but is not a directory.`,
			path,
		});
		return undefined;
	}
	if (inspection.type === "error") {
		diagnostics.push({ code: inspection.error.code, message: inspection.error.message, path });
		return undefined;
	}
	if (inspection.gitkeep === "not-file") {
		diagnostics.push({
			code: "consumer-gitkeep-not-file",
			message: `${path}/.gitkeep exists but is not a file.`,
			path: `${path}/.gitkeep`,
		});
		return undefined;
	}
	return { path, change: inspection.gitkeep === "missing" ? "updated" : "unchanged" };
}

function stableConsumerDirectories(
	descriptors: readonly DeclaredExtensionDescriptor[],
): readonly string[] {
	const seen = new Set<string>();
	const paths: string[] = [];
	for (const record of descriptors) {
		for (const path of record.descriptor.activation?.consumerDirs ?? []) {
			if (seen.has(path)) continue;
			seen.add(path);
			paths.push(path);
		}
	}
	return paths;
}

function fileChange(
	read: ActivationTextFileReadResult,
	change: "appended" | "replaced" | "unchanged",
): FileActivationOutcome["change"] {
	return read.type === "missing" ? "created" : change;
}

function generatedFileChange(
	read: ActivationTextFileReadResult,
	content: string,
): FileActivationOutcome["change"] {
	if (read.type === "missing") return "created";
	return read.type === "found" && read.content === content ? "unchanged" : "replaced";
}

function toActivationDiagnostic(
	diagnostic: { readonly code: string; readonly message: string; readonly path?: string },
	path: string | undefined = diagnostic.path,
): ActivationDiagnostic {
	return {
		code: diagnostic.code,
		message: diagnostic.message,
		...(path === undefined ? {} : { path }),
	};
}

function artifactConflictDiagnostic(artifactId: string, harness: HarnessId): ActivationDiagnostic {
	return {
		code: "artifact-local-conflict",
		message: `Artifact ${artifactId} conflicts with local files for ${harness}.`,
	};
}

export async function resolveActivationRepository(
	context: NsActivationContext,
	cwd: string,
): Promise<ResolveActivationRepositoryResult> {
	const repoRootResult = await context.git.optionalRepoRoot({ cwd });
	if (repoRootResult.type === "error") return { type: "error", error: repoRootResult.error };
	if (repoRootResult.type === "missing") {
		return {
			type: "not-a-git-repo",
			message: `No git repository found at ${cwd}; run \`git init\` first.`,
			cwd,
		};
	}
	const trunkResult = await context.git.trunkBranch({ cwd: repoRootResult.value });
	if (trunkResult.type === "error") return { type: "error", error: trunkResult.error };
	if (trunkResult.type === "missing") {
		return {
			type: "trunk-undetectable",
			message:
				"Could not detect a trunk branch for this repository; ns requires a stable git trunk.",
			repoRoot: repoRootResult.value,
		};
	}
	return {
		type: "resolved",
		repository: { repoRoot: repoRootResult.value, trunkBranch: trunkResult.value },
	};
}
