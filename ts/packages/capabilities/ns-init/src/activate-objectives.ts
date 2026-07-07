import type { HarnessId } from "@nseng-ai/harness-artifacts/api";

import type { ObjectiveActivationContext } from "./activation-context.ts";
import type {
	ActivationFilesGateway,
	InstructionFileName,
	TextFileReadResult,
} from "./activation-files.ts";
import type { NsInitErrorInfo } from "./error-info.ts";
import { applyObjectiveInstructionBlock, ensureClaudeAgentsImport } from "./instruction-block.ts";
import type { SkillMaterializeResult } from "./skill-materializer.ts";

export interface ResolvedActivationRepository {
	repoRoot: string;
	trunkBranch: string;
}

export type ResolveActivationRepositoryResult =
	| { type: "resolved"; repository: ResolvedActivationRepository }
	| { type: "not-a-git-repo"; message: string; cwd: string }
	| { type: "trunk-undetectable"; message: string; repoRoot: string }
	| { type: "error"; error: NsInitErrorInfo };

export interface ActivateObjectivesOptions {
	cwd: string;
	harnesses: readonly HarnessId[];
	resolvedRepository?: ResolvedActivationRepository;
}

export interface ObjectiveActivationReport {
	repoRoot: string;
	trunkBranch: string;
	agentsInstructionFile: { change: "created" | "appended" | "replaced" | "unchanged" };
	claudeInstructionFile: { change: "created" | "appended" | "unchanged" };
	objectivesDirectory: { created: boolean };
	skills: SkillMaterializeResult;
}

export type ActivateObjectivesResult =
	| { type: "activated"; report: ObjectiveActivationReport }
	| { type: "not-a-git-repo"; message: string; cwd: string }
	| { type: "trunk-undetectable"; message: string; repoRoot: string }
	| { type: "agents-block-malformed"; reason: string }
	| { type: "error"; error: NsInitErrorInfo };

/**
 * Activate Objectives in a repository: write the managed `ns:objectives:*` instruction
 * block into `AGENTS.md` (plus the `CLAUDE.md → @AGENTS.md` import), create
 * `.ns/objectives/`, and invoke the skill-materialization seam. Git posture is
 * verify-and-write: the repo and a detectable trunk are required, and nothing is ever
 * staged or committed.
 */
export async function activateObjectives(
	context: ObjectiveActivationContext,
	options: ActivateObjectivesOptions,
): Promise<ActivateObjectivesResult> {
	if (options.harnesses.length === 0) {
		return {
			type: "error",
			error: { code: "harness-selection-empty", message: "At least one harness must be selected." },
		};
	}

	let repository = options.resolvedRepository;
	if (repository === undefined) {
		const repositoryResult = await resolveActivationRepository(context, options.cwd);
		if (repositoryResult.type !== "resolved") return repositoryResult;
		repository = repositoryResult.repository;
	}
	const { repoRoot, trunkBranch } = repository;

	const agentsApplied = await readTransformWriteInstructionFile({
		files: context.files,
		repoRoot,
		file: "AGENTS.md",
		transform: (read) =>
			applyObjectiveInstructionBlock({ text: read.type === "found" ? read.content : "" }),
	});
	if (agentsApplied.type === "error") return { type: "error", error: agentsApplied.error };
	const agentsAppliedResult = agentsApplied.result;
	if (agentsAppliedResult.type === "malformed") {
		return { type: "agents-block-malformed", reason: agentsAppliedResult.reason };
	}

	const claudeEnsured = await readTransformWriteInstructionFile({
		files: context.files,
		repoRoot,
		file: "CLAUDE.md",
		transform: (read) => ({
			type: "applied",
			...ensureClaudeAgentsImport({ text: read.type === "found" ? read.content : "" }),
		}),
	});
	if (claudeEnsured.type === "error") return { type: "error", error: claudeEnsured.error };

	const directoryResult = await context.files.ensureObjectivesDirectory({ repoRoot });
	if (!directoryResult.ok) return { type: "error", error: directoryResult.error };

	const skills = await context.skills.materializeObjectiveSkills({
		repoRoot,
		harnesses: options.harnesses,
	});

	return {
		type: "activated",
		report: {
			repoRoot,
			trunkBranch,
			agentsInstructionFile: {
				change: reportedChange({ existed: agentsApplied.existed, result: agentsAppliedResult }),
			},
			claudeInstructionFile: {
				change: reportedChange(claudeEnsured),
			},
			objectivesDirectory: { created: directoryResult.value.created },
			skills,
		},
	};
}

interface InstructionFileWritableTransformResult {
	type: "applied";
	content: string;
	change: "appended" | "replaced" | "unchanged";
}

type InstructionFileTransformResult =
	| InstructionFileWritableTransformResult
	| { type: "malformed"; reason: string };

type ReadTransformWriteInstructionFileResult<Result extends InstructionFileTransformResult> =
	| { type: "ok"; existed: boolean; result: Result }
	| { type: "error"; error: NsInitErrorInfo };

async function readTransformWriteInstructionFile<
	Result extends InstructionFileTransformResult,
>(params: {
	files: ActivationFilesGateway;
	repoRoot: string;
	file: InstructionFileName;
	transform: (read: TextFileReadResult) => Result;
}): Promise<ReadTransformWriteInstructionFileResult<Result>> {
	const read = await params.files.readInstructionFile({
		repoRoot: params.repoRoot,
		file: params.file,
	});
	if (read.type === "error") return { type: "error", error: read.error };

	const result = params.transform(read);
	if (result.type === "applied" && result.change !== "unchanged") {
		const write = await params.files.writeInstructionFile({
			repoRoot: params.repoRoot,
			file: params.file,
			content: result.content,
		});
		if (!write.ok) return { type: "error", error: write.error };
	}

	return { type: "ok", existed: read.type === "found", result };
}

export async function resolveActivationRepository(
	context: ObjectiveActivationContext,
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
				"Could not detect a trunk branch for this repository; objectives need one to anchor durable records.",
			repoRoot: repoRootResult.value,
		};
	}

	return {
		type: "resolved",
		repository: { repoRoot: repoRootResult.value, trunkBranch: trunkResult.value },
	};
}

function reportedChange<Change extends string>(params: {
	existed: boolean;
	result: { type: "applied"; change: Change };
}): Change | "created" {
	return params.existed ? params.result.change : "created";
}
