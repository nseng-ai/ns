import type { ObjectiveActivationContext } from "./activation-context.ts";
import { applyObjectiveInstructionBlock, ensureClaudeAgentsImport } from "./instruction-block.ts";
import type { HarnessId, SkillMaterializeResult } from "./skill-materializer.ts";

export interface ActivateObjectivesOptions {
	cwd: string;
	harnesses: readonly HarnessId[];
}

export interface ActivationErrorInfo {
	code: string;
	message: string;
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
	| { type: "not-a-git-repo"; message: string }
	| { type: "trunk-undetectable"; message: string }
	| { type: "agents-block-malformed"; reason: string }
	| { type: "error"; error: ActivationErrorInfo };

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

	const repoRootResult = await context.git.optionalRepoRoot({ cwd: options.cwd });
	if (repoRootResult.type === "error") return { type: "error", error: repoRootResult.error };
	if (repoRootResult.type === "missing") {
		return {
			type: "not-a-git-repo",
			message: `No git repository found at ${options.cwd}; run \`git init\` first.`,
		};
	}
	const repoRoot = repoRootResult.value;

	const trunkResult = await context.git.trunkBranch({ cwd: repoRoot });
	if (trunkResult.type === "error") return { type: "error", error: trunkResult.error };
	if (trunkResult.type === "missing") {
		return {
			type: "trunk-undetectable",
			message:
				"Could not detect a trunk branch for this repository; objectives need one to anchor durable records.",
		};
	}

	const agentsRead = await context.files.readInstructionFile({ repoRoot, file: "AGENTS.md" });
	if (agentsRead.type === "error") return { type: "error", error: agentsRead.error };
	const agentsExisted = agentsRead.type === "found";
	const agentsApplied = applyObjectiveInstructionBlock({
		text: agentsExisted ? agentsRead.content : "",
	});
	if (agentsApplied.type === "malformed") {
		return { type: "agents-block-malformed", reason: agentsApplied.reason };
	}
	if (agentsApplied.change !== "unchanged") {
		const write = await context.files.writeInstructionFile({
			repoRoot,
			file: "AGENTS.md",
			content: agentsApplied.content,
		});
		if (!write.ok) return { type: "error", error: write.error };
	}

	const claudeRead = await context.files.readInstructionFile({ repoRoot, file: "CLAUDE.md" });
	if (claudeRead.type === "error") return { type: "error", error: claudeRead.error };
	const claudeExisted = claudeRead.type === "found";
	const claudeEnsured = ensureClaudeAgentsImport({ text: claudeExisted ? claudeRead.content : "" });
	if (claudeEnsured.change !== "unchanged") {
		const write = await context.files.writeInstructionFile({
			repoRoot,
			file: "CLAUDE.md",
			content: claudeEnsured.content,
		});
		if (!write.ok) return { type: "error", error: write.error };
	}

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
			trunkBranch: trunkResult.value,
			agentsInstructionFile: { change: agentsExisted ? agentsApplied.change : "created" },
			claudeInstructionFile: { change: claudeExisted ? claudeEnsured.change : "created" },
			objectivesDirectory: { created: directoryResult.value.created },
			skills,
		},
	};
}
