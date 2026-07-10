import type {
	DeclaredArtifactActivationOutcome,
	HarnessId,
	NsTomlChange,
	PreparedDeclaredArtifactActivation,
} from "@nseng-ai/harness-artifacts/api";
import { parseNsTomlExtensions } from "@nseng-ai/harness-artifacts/api";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";

import type { NsActivationContext } from "./activation-context.ts";
import {
	ACTIVATION_FILE_PATHS,
	type ActivationFile,
	type ActivationTextFileReadResult,
	type ConsumerDirectoryInspectionResult,
	type ExpectedActivationTextFileState,
	type ExpectedConsumerDirectoryState,
	type PreparedActivationExpectedState,
	type PreparedStateMismatchDetails,
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
	readonly nsToml?: FileActivationOutcome | undefined;
	readonly managedExtensionsIgnore?: FileActivationOutcome | undefined;
	readonly agentsInstructionFile?: FileActivationOutcome | undefined;
	readonly claudeInstructionFile?: FileActivationOutcome | undefined;
	readonly generatedInstructionsFile?: FileActivationOutcome | undefined;
	readonly consumerDirectories?: readonly ConsumerDirectoryOutcome[] | undefined;
	readonly artifacts?: readonly DeclaredArtifactActivationOutcome[] | undefined;
}

interface PreparedFileWrite {
	readonly file: ActivationFile;
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
	readonly managedExtensionsIgnore: PreparedFileWrite;
	readonly agents: PreparedFileWrite;
	readonly claude: PreparedFileWrite;
	readonly instructions: PreparedFileWrite;
	readonly consumerDirectories: readonly PreparedConsumerDirectory[];
	readonly expectedState: PreparedActivationExpectedState;
	readonly artifacts: PreparedDeclaredArtifactActivation;
	readonly descriptors: readonly DeclaredExtensionDescriptor[];
}

export type PrepareNsActivationResult =
	| { readonly type: "prepared"; readonly activation: PreparedNsActivation }
	| {
			readonly type: "preflight-failed";
			readonly diagnostics: readonly ActivationDiagnostic[];
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
	readonly nsTomlExpected: ExpectedActivationTextFileState;
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

	const [managedExtensionsIgnoreRead, agentsRead, claudeRead, instructionsRead] = await Promise.all(
		[
			context.files.readActivationFile({
				repoRoot: options.repository.repoRoot,
				file: "managed-extensions-ignore",
			}),
			context.files.readActivationFile({
				repoRoot: options.repository.repoRoot,
				file: "agents-instructions",
			}),
			context.files.readActivationFile({
				repoRoot: options.repository.repoRoot,
				file: "claude-instructions",
			}),
			context.files.readActivationFile({
				repoRoot: options.repository.repoRoot,
				file: "generated-instructions",
			}),
		],
	);
	const managedExtensionsIgnoreText = textForPreflight(
		managedExtensionsIgnoreRead,
		ACTIVATION_FILE_PATHS["managed-extensions-ignore"],
		diagnostics,
	);
	const managedExtensionsIgnore = planManagedExtensionsIgnore(
		managedExtensionsIgnoreRead,
		managedExtensionsIgnoreText,
	);
	const agentsText = textForPreflight(
		agentsRead,
		ACTIVATION_FILE_PATHS["agents-instructions"],
		diagnostics,
	);
	const claudeText = textForPreflight(
		claudeRead,
		ACTIVATION_FILE_PATHS["claude-instructions"],
		diagnostics,
	);
	textForPreflight(instructionsRead, ACTIVATION_FILE_PATHS["generated-instructions"], diagnostics);
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
	const expectedConsumerDirectories: Record<string, ExpectedConsumerDirectoryState> = {};
	for (const path of consumerDirectories) {
		const inspection = await context.files.inspectConsumerDirectory({
			repoRoot: options.repository.repoRoot,
			relativePath: path,
		});
		const prepared = consumerDirectoryPreflight(path, inspection, diagnostics);
		if (prepared !== undefined) {
			preparedConsumerDirectories.push(prepared);
			expectedConsumerDirectories[path] = expectedConsumerDirectoryState(inspection);
		}
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
			const artifactId = item.type === "remove" ? item.removal.entry.artifactId : item.artifact.id;
			diagnostics.push(artifactConflictDiagnostic(artifactId, item.harness));
		}
	}

	if (diagnostics.length > 0 || agentsApplied.type === "malformed" || !artifactPreparation.ok) {
		return { type: "preflight-failed", diagnostics };
	}
	return {
		type: "prepared",
		activation: {
			repository: options.repository,
			harnesses: [...options.harnesses],
			harnessSource: options.harnessSource,
			nsToml: { file: "ns-toml", content: options.nsTomlContent, change: options.nsTomlChange },
			managedExtensionsIgnore,
			agents: {
				file: "agents-instructions",
				content: agentsApplied.content,
				change: fileChange(agentsRead, agentsApplied.change),
			},
			claude: {
				file: "claude-instructions",
				content: claudeApplied.content,
				change: fileChange(claudeRead, claudeApplied.change),
			},
			instructions: {
				file: "generated-instructions",
				content: generatedInstructions,
				change: generatedFileChange(instructionsRead, generatedInstructions),
			},
			consumerDirectories: preparedConsumerDirectories,
			expectedState: {
				files: {
					"ns-toml": options.nsTomlExpected,
					"managed-extensions-ignore": expectedTextFileState(managedExtensionsIgnoreRead),
					"agents-instructions": expectedTextFileState(agentsRead),
					"claude-instructions": expectedTextFileState(claudeRead),
					"generated-instructions": expectedTextFileState(instructionsRead),
				},
				consumerDirectories: expectedConsumerDirectories,
			},
			artifacts: artifactPreparation.prepared,
			descriptors: loaded.descriptors,
		},
	};
}

export async function applyNsActivation(
	context: NsActivationContext,
	prepared: PreparedNsActivation,
): Promise<ApplyNsActivationResult> {
	const completed: MutableActivationCompleted = {};
	const fileDuties = [
		["nsToml", prepared.nsToml],
		["managedExtensionsIgnore", prepared.managedExtensionsIgnore],
		["agentsInstructionFile", prepared.agents],
		["claudeInstructionFile", prepared.claude],
		["generatedInstructionsFile", prepared.instructions],
	] as const;
	for (const [field, write] of fileDuties) {
		if (write.change !== "unchanged") {
			const written = await context.files.compareAndWriteActivationFile({
				repoRoot: prepared.repository.repoRoot,
				file: write.file,
				expected: prepared.expectedState.files[write.file],
				content: write.content,
			});
			if (written.type !== "applied") {
				return {
					type: "apply-failed",
					phase: write.file,
					error:
						written.type === "error" ? written.error : preparedStateMismatchError(written.details),
					completed,
				};
			}
		}
		completed[field] = { change: write.change };
	}

	const consumerOutcomes: ConsumerDirectoryOutcome[] = [];
	for (const directory of prepared.consumerDirectories) {
		if (directory.change !== "unchanged") {
			const expected = prepared.expectedState.consumerDirectories[directory.path];
			if (expected === undefined) throw new Error(`Missing expected state for ${directory.path}.`);
			const ensured = await context.files.compareAndEnsureConsumerDirectory({
				repoRoot: prepared.repository.repoRoot,
				relativePath: directory.path,
				expected,
			});
			if (ensured.type !== "applied") {
				if (consumerOutcomes.length > 0) completed.consumerDirectories = consumerOutcomes;
				return {
					type: "apply-failed",
					phase: "consumer-directories",
					error:
						ensured.type === "error" ? ensured.error : preparedStateMismatchError(ensured.details),
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

function expectedTextFileState(
	read: ActivationTextFileReadResult,
): ExpectedActivationTextFileState {
	if (read.type === "found") return { type: "file", content: read.content };
	if (read.type === "missing") return { type: "missing" };
	throw new Error("Cannot prepare expected state from a failed activation file inspection.");
}

function expectedConsumerDirectoryState(
	inspection: ConsumerDirectoryInspectionResult,
): ExpectedConsumerDirectoryState {
	if (inspection.type === "missing") return { type: "missing" };
	if (inspection.type === "directory" && inspection.gitkeep !== "not-file") {
		return { type: "directory", gitkeep: inspection.gitkeep };
	}
	throw new Error("Cannot prepare expected state from a failed consumer directory inspection.");
}

function preparedStateMismatchError(details: PreparedStateMismatchDetails): NsInitErrorInfo {
	return {
		code: "activation-prepared-state-mismatch",
		message: `${details.path} changed after activation was prepared; no mutation was applied to that path.`,
		details: { ...details },
	};
}

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

const MANAGED_EXTENSIONS_IGNORE_RULE = ".ns/managed-extensions/";

function planManagedExtensionsIgnore(
	read: ActivationTextFileReadResult,
	text: string,
): PreparedFileWrite {
	const hasExactRule = text.split(/\r?\n/u).includes(MANAGED_EXTENSIONS_IGNORE_RULE);
	if (hasExactRule) {
		return { file: "managed-extensions-ignore", content: text, change: "unchanged" };
	}
	const separator = text.length === 0 || text.endsWith("\n") ? "" : "\n";
	return {
		file: "managed-extensions-ignore",
		content: `${text}${separator}${MANAGED_EXTENSIONS_IGNORE_RULE}\n`,
		change: read.type === "missing" ? "created" : "appended",
	};
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
