import path from "node:path";

import { failure, ok, shellNegative, type ClinkrExit } from "@asdl/clinkr";
import { managedRegionBounds } from "@asdl/core/managed-region";
import { resultErr, type Result } from "@asdl/core/result";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type { AregInitTextWritePlan, AregPathState, AregTextFileState } from "../gateways.ts";
import { rejectTextState, validateOptionalDirectoryState } from "./file-state.ts";
import { parseAsdlAregAgents, parseLegacyAregJsonAgents, resolveProjectAgents } from "./project-agents.ts";
import { inspectInitProject } from "./project-inspection.ts";
import {
	applyProjectMutationPlan,
	PROJECT_MUTATION_OPERATION_STATUSES,
	PROJECT_MUTATION_OPERATION_TYPES,
	type ProjectMutationOperationStatusRecord,
} from "./project-mutations.ts";

export { parseAsdlAregAgents, parseLegacyAregJsonAgents, resolveProjectAgents } from "./project-agents.ts";

const BOOTSTRAP_REPO = "dagster-io/asdl-tools";
const BOOTSTRAP_SKILLS = ["skill-management", "skillx"] as const;
const AGENTS_BLOCK_START = "<!-- areg:skills:start -->";
const AGENTS_BLOCK_END = "<!-- areg:skills:end -->";
const CLAUDE_BLOCK_START = "<!-- areg:claude-skills:start -->";
const CLAUDE_BLOCK_END = "<!-- areg:claude-skills:end -->";

export const AGENTS_BLOCK = [
	AGENTS_BLOCK_START,
	"## Skills",
	"",
	"This project uses agent skills installed on disk.",
	"",
	"- Discover installed skills from their `SKILL.md` frontmatter under `.agents/skills/`; do not keep a duplicate skill index in this file.",
	"- Local first-party skills live in `skills/<name>/`; `.agents/skills/<name>` should symlink to `../../skills/<name>`.",
	"- GitHub-sourced or vendored skills live as real directories under `.agents/skills/<name>/`; do not refactor or lint them as first-party project code unless explicitly asked.",
	"- `.claude/skills/<name>` entries symlink to `../../.agents/skills/<name>` for Claude Code.",
	"- For persistent skill add, update, remove, list, and publish workflows, use the installed `skill-management` skill, which documents the `npx skills` commands for this project.",
	AGENTS_BLOCK_END,
].join("\n");

const CLAUDE_NOTE = "Claude Code discovers installed skills from `.claude/skills/`, which symlinks into `.agents/skills/`. Use Claude's skill invocation UI for installed skills when available. Use `skill-management` for persistent skill changes and `skillx` for transient GitHub skill execution.";

export const SETTINGS_LOCAL_JSON = `{
  "permissions": {
    "allow": [
      "Bash(npx skills:*)"
    ]
  }
}
`;

export const initRequestSchema = z.object({
	target: z.string().default(".").describe("Project directory to initialize."),
	agent: z.array(z.string()).default([]).describe("Agent to install skills for; repeatable."),
	yes: z.boolean().default(false).describe("Approve adding or updating areg-managed instruction blocks without prompting."),
	append: z.boolean().default(true).describe("Do not modify existing AGENTS.md or CLAUDE.md prose files."),
});

const skippedFileSchema = z.object({
	path: z.string(),
	reason: z.string(),
});

const initOperationStatusSchema = z.object({
	type: z.enum(PROJECT_MUTATION_OPERATION_TYPES),
	path: z.string(),
	description: z.string(),
	status: z.enum(PROJECT_MUTATION_OPERATION_STATUSES),
	error: z.unknown().optional(),
});

export const initResultSchema = z.object({
	project_dir: z.string(),
	agents: z.array(z.string()),
	bootstrap_repo: z.string(),
	bootstrap_skills: z.array(z.string()),
	written_files: z.array(z.string()),
	skipped_files: z.array(skippedFileSchema),
	mutation_failed: z.boolean().optional(),
	operations: z.array(initOperationStatusSchema).optional(),
});

export type InitRequest = z.infer<typeof initRequestSchema>;
export type InitResult = z.infer<typeof initResultSchema>;

interface SkippedFile {
	path: string;
	reason: string;
}

interface InitTextPlan {
	writes: readonly AregInitTextWritePlan[];
	skippedFiles: readonly SkippedFile[];
}

interface ManagedMarkers {
	start: string;
	end: string;
}

interface InitMutationFailureOptions {
	message: string;
	projectDir: string;
	agents: readonly string[];
	textPlan: InitTextPlan;
	operations: readonly ProjectMutationOperationStatusRecord[];
}

function initMutationFailure(options: InitMutationFailureOptions): ClinkrExit<InitResult> {
	return shellNegative(options.message, {
		mutation_failed: true,
		project_dir: options.projectDir,
		agents: [...options.agents],
		bootstrap_repo: BOOTSTRAP_REPO,
		bootstrap_skills: [...BOOTSTRAP_SKILLS],
		written_files: options.operations.filter((operation) => operation.type === "write" && operation.status === "applied").map((operation) => operation.path),
		skipped_files: options.textPlan.skippedFiles.map((skipped) => ({ ...skipped })),
		operations: options.operations.map((operation) => ({ ...operation })),
	});
}

function npxSkillsAddOperation(status: ProjectMutationOperationStatusRecord["status"], error?: ProjectMutationOperationStatusRecord["error"]): ProjectMutationOperationStatusRecord {
	return {
		type: "external",
		path: "npx skills add",
		description: `Install bootstrap skills from ${BOOTSTRAP_REPO}`,
		status,
		error,
	};
}

export async function runInit(ctx: AregCliContext, request: InitRequest): Promise<ClinkrExit<InitResult>> {
	const noAppend = !request.append;
	if (request.yes && noAppend) {
		return failure("invalid_request", "--yes and --no-append cannot be used together.");
	}

	const tool = await ctx.host.checkTool({ tool: "npx", cwd: ctx.cwd, env: ctx.env });
	if (tool.type === "missing") return failure("missing_tool", tool.message);

	const inspection = await inspectInitProject(ctx, request.target);
	if (inspection.projectPathState.type === "missing") return failure("invalid_project", `Target ${inspection.projectDir} does not exist.`);
	if (inspection.projectPathState.type !== "directory") return failure("invalid_project", `${inspection.projectDir} is not a directory.`);

	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: inspection.projectDir });
	if (repoRoot.type === "error") return failure("git_error", repoRoot.error.message);
	if (repoRoot.type === "missing") {
		return failure("invalid_project", `Target ${inspection.projectDir} must be a Git worktree root. Run git init first.`);
	}
	if (repoRoot.value !== inspection.projectDir) {
		return failure(
			"invalid_project",
			`Target ${inspection.projectDir} is inside a Git worktree but is not the root. Run areg init ${repoRoot.value} instead.`,
		);
	}

	const agentsResult = resolveProjectAgents({ explicitAgents: request.agent, asdlToml: inspection.asdlToml, aregJson: inspection.aregJson });
	if (!agentsResult.ok) return failure("agent_resolution_failed", agentsResult.error.message);
	const agents = agentsResult.value;

	const planResult = await buildInitTextPlan(ctx, inspection, { agents, yes: request.yes, noAppend });
	if (!planResult.ok) return failure("write_plan_failed", planResult.error.message);
	const textPlan = planResult.value;

	const preflight = await applyProjectMutationPlan({ ctx, projectDir: inspection.projectDir, policy: "init", writes: textPlan.writes, execute: false });
	if (!preflight.ok) {
		return initMutationFailure({
			message: `Cannot initialize areg: ${preflight.error.message}`,
			projectDir: inspection.projectDir,
			agents,
			textPlan,
			operations: [npxSkillsAddOperation("not_attempted"), ...preflight.operationStatuses],
		});
	}

	const install = await ctx.npxSkills.addSkills({
		sourceRepo: BOOTSTRAP_REPO,
		skillNames: BOOTSTRAP_SKILLS,
		targetAgents: agents,
		cwd: inspection.projectDir,
		env: ctx.env,
	});
	if (install.type === "error") {
		return initMutationFailure({
			message: `npx skills add failed: ${install.error.message}`,
			projectDir: inspection.projectDir,
			agents,
			textPlan,
			operations: [
				npxSkillsAddOperation("failed", install.error),
				...preflight.operationStatuses,
			],
		});
	}

	const apply = await applyProjectMutationPlan({ ctx, projectDir: inspection.projectDir, policy: "init", writes: textPlan.writes });
	if (!apply.ok) {
		return initMutationFailure({
			message: `Cannot finish areg init: ${apply.error.message}`,
			projectDir: inspection.projectDir,
			agents,
			textPlan,
			operations: [npxSkillsAddOperation("applied"), ...apply.operationStatuses],
		});
	}

	return ok({
		project_dir: inspection.projectDir,
		agents: [...agents],
		bootstrap_repo: BOOTSTRAP_REPO,
		bootstrap_skills: [...BOOTSTRAP_SKILLS],
		written_files: [...apply.writtenRelativePaths],
		skipped_files: textPlan.skippedFiles.map((skipped) => ({ ...skipped })),
	});
}

export function renderInit(result: InitResult): string {
	return [
		`Initialized areg in ${result.project_dir}`,
		"Bootstrap skills installed: skill-management, skillx",
		"Review and commit generated files when ready.",
		"Install more persistent skills with `npx skills add ...`.",
	].join("\n");
}

export function renderAregSection(agents: readonly string[]): string {
	return `[areg]\nagents = ${JSON.stringify([...agents])}\n`;
}

export function replaceOrAppendAregSection(content: string, agents: readonly string[]): string {
	const lines = content.split(/(?<=\n)/u);
	if (lines.length === 1 && lines[0] === "") lines.pop();
	const start = aregSectionStart(lines);
	if (start === undefined) return appendTomlSection(content, renderAregSection(agents));
	const end = tomlSectionEnd(lines, start);
	let replacement = renderAregSection(agents);
	if (end < lines.length) replacement += "\n";
	lines.splice(start, end - start, ...replacement.match(/.*(?:\n|$)/gu)?.filter((line) => line.length > 0) ?? []);
	return lines.join("");
}

export function managedBlockBounds(content: string, markers: ManagedMarkers, pathLabel: string): Result<{ start: number; end: number } | null> {
	const bounds = managedRegionBounds({ text: content, startMarker: markers.start, endMarker: markers.end });
	if (bounds.type === "missing") return { ok: true, value: null };
	if (bounds.type === "malformed") return resultErr({ code: "managed_block_malformed", message: `${pathLabel} has a malformed areg-managed block. Fix the markers manually.` });
	return { ok: true, value: { start: bounds.start, end: bounds.end } };
}

export function appendBlock(content: string, block: string): string {
	if (content.length === 0) return `${block}\n`;
	if (content.endsWith("\n\n")) return `${content}${block}\n`;
	if (content.endsWith("\n")) return `${content}\n${block}\n`;
	return `${content}\n\n${block}\n`;
}

export function claudeBlock(options: { includeAgentsRef: boolean }): string {
	const lines = [CLAUDE_BLOCK_START, "## Claude Code skills", ""];
	if (options.includeAgentsRef) lines.push("@AGENTS.md", "");
	lines.push(CLAUDE_NOTE, CLAUDE_BLOCK_END);
	return lines.join("\n");
}

async function buildInitTextPlan(
	ctx: AregCliContext,
	inspection: {
		projectDir: string;
		agentsMd: AregTextFileState;
		claudeMd: AregTextFileState;
		asdlToml: AregTextFileState;
		claudeDir: AregPathState;
		claudeSettings: AregTextFileState;
	},
	options: { agents: readonly string[]; yes: boolean; noAppend: boolean },
): Promise<Result<InitTextPlan>> {
	const asdl = planAsdlToml(inspection.asdlToml, options.agents);
	if (!asdl.ok) return asdl;

	const agents = await planManagedBlock(ctx, {
		path: "AGENTS.md",
		state: inspection.agentsMd,
		newFileContent: `# Agents\n\n${AGENTS_BLOCK}\n`,
		block: AGENTS_BLOCK,
		markers: { start: AGENTS_BLOCK_START, end: AGENTS_BLOCK_END },
		yes: options.yes,
		noAppend: options.noAppend,
		appendPrompt: "AGENTS.md exists without an areg-managed Skills block. Add one?",
		updatePrompt: "AGENTS.md has an existing areg-managed Skills block. Replace it?",
	});
	if (!agents.ok) return agents;

	const claude = await planClaudeMd(ctx, inspection.projectDir, inspection.claudeMd, { yes: options.yes, noAppend: options.noAppend });
	if (!claude.ok) return claude;

	const settings = planSettings(inspection.claudeDir, inspection.claudeSettings);
	if (!settings.ok) return settings;

	const textPlans = [agents.value, claude.value, settings.value];
	return {
		ok: true,
		value: {
			writes: [asdl.value, ...textPlans.filter(isTextWritePlan)],
			skippedFiles: textPlans.filter(isSkippedFile).map((skipped) => ({ ...skipped })),
		},
	};
}

function planAsdlToml(state: AregTextFileState, agents: readonly string[]): Result<AregInitTextWritePlan> {
	if (state.type === "missing") return { ok: true, value: writePlan("asdl.toml", renderAregSection(agents), "asdl.toml") };
	if (state.type !== "file") return rejectTextState({ pathLabel: "asdl.toml", state, description: "asdl.toml", action: "manage it" });
	const parsed = parseAsdlAregAgents(state.text, "asdl.toml");
	if (!parsed.ok) return parsed;
	return { ok: true, value: writePlan("asdl.toml", replaceOrAppendAregSection(state.text, agents), "asdl.toml") };
}

async function planClaudeMd(
	ctx: AregCliContext,
	projectDir: string,
	state: AregTextFileState,
	options: { yes: boolean; noAppend: boolean },
): Promise<Result<AregInitTextWritePlan | SkippedFile>> {
	let includeAgentsRef = true;
	if (state.type === "file") {
		const outside = contentWithoutManagedBlock(state.text, { start: CLAUDE_BLOCK_START, end: CLAUDE_BLOCK_END }, "CLAUDE.md");
		if (!outside.ok) return outside;
		includeAgentsRef = !outside.value.includes("@AGENTS.md");
	}
	const block = claudeBlock({ includeAgentsRef });
	return await planManagedBlock(ctx, {
		path: "CLAUDE.md",
		state,
		newFileContent: `# ${path.basename(projectDir)}\n\n${block}\n`,
		block,
		markers: { start: CLAUDE_BLOCK_START, end: CLAUDE_BLOCK_END },
		yes: options.yes,
		noAppend: options.noAppend,
		appendPrompt: "CLAUDE.md exists without an areg-managed Claude skills block. Add one?",
		updatePrompt: "CLAUDE.md has an existing areg-managed Claude skills block. Replace it?",
	});
}

async function planManagedBlock(
	ctx: AregCliContext,
	input: {
		path: "AGENTS.md" | "CLAUDE.md";
		state: AregTextFileState;
		newFileContent: string;
		block: string;
		markers: ManagedMarkers;
		yes: boolean;
		noAppend: boolean;
		appendPrompt: string;
		updatePrompt: string;
	},
): Promise<Result<AregInitTextWritePlan | SkippedFile>> {
	if (input.state.type === "missing") return { ok: true, value: writePlan(input.path, input.newFileContent, input.path) };
	if (input.state.type !== "file") return rejectTextState({ pathLabel: input.path, state: input.state, description: input.path, action: "manage it" });
	const bounds = managedBlockBounds(input.state.text, input.markers, input.path);
	if (!bounds.ok) return bounds;
	if (bounds.value === null) {
		if (input.noAppend) return { ok: true, value: { path: input.path, reason: "--no-append skips existing file without managed block" } };
		if (!input.yes && !(await ctx.prompt.confirm({ message: input.appendPrompt, defaultValue: false }))) {
			return { ok: true, value: { path: input.path, reason: "user declined adding managed block" } };
		}
		return { ok: true, value: writePlan(input.path, appendBlock(input.state.text, input.block), input.path) };
	}
	const currentBlock = input.state.text.slice(bounds.value.start, bounds.value.end);
	if (currentBlock === input.block) return { ok: true, value: { path: input.path, reason: "managed block is already current" } };
	if (input.noAppend) return { ok: true, value: { path: input.path, reason: "--no-append skips existing managed block replacement" } };
	if (!input.yes && !(await ctx.prompt.confirm({ message: input.updatePrompt, defaultValue: false }))) {
		return { ok: true, value: { path: input.path, reason: "user declined replacing managed block" } };
	}
	return {
		ok: true,
		value: writePlan(input.path, `${input.state.text.slice(0, bounds.value.start)}${input.block}${input.state.text.slice(bounds.value.end)}`, input.path),
	};
}

function contentWithoutManagedBlock(content: string, markers: ManagedMarkers, pathLabel: string): Result<string> {
	const bounds = managedBlockBounds(content, markers, pathLabel);
	if (!bounds.ok) return bounds;
	if (bounds.value === null) return { ok: true, value: content };
	return { ok: true, value: `${content.slice(0, bounds.value.start)}${content.slice(bounds.value.end)}` };
}

function planSettings(claudeDirState: AregPathState, settingsState: AregTextFileState): Result<AregInitTextWritePlan | SkippedFile> {
	const claudeDir = validateOptionalDirectoryState({ pathLabel: ".claude", state: claudeDirState, action: "manage it", symlinkSubject: ".claude at .claude" });
	if (!claudeDir.ok) return claudeDir;
	if (settingsState.type === "missing") return { ok: true, value: writePlan(".claude/settings.local.json", SETTINGS_LOCAL_JSON, "settings.local.json", true) };
	if (settingsState.type !== "file") return rejectTextState({ pathLabel: ".claude/settings.local.json", state: settingsState, description: "settings.local.json", action: "manage it" });
	return { ok: true, value: { path: ".claude/settings.local.json", reason: "existing settings file is preserved" } };
}

function isTextWritePlan(plan: AregInitTextWritePlan | SkippedFile): plan is AregInitTextWritePlan {
	return "relativePath" in plan;
}

function isSkippedFile(plan: AregInitTextWritePlan | SkippedFile): plan is SkippedFile {
	return !("relativePath" in plan);
}

function writePlan(relativePath: AregInitTextWritePlan["relativePath"], content: string, description: string, createParent = false): AregInitTextWritePlan {
	return { relativePath, content, description, createParent };
}

function appendTomlSection(content: string, section: string): string {
	if (content.length === 0) return section;
	if (content.endsWith("\n\n")) return `${content}${section}`;
	if (content.endsWith("\n")) return `${content}\n${section}`;
	return `${content}\n\n${section}`;
}

function aregSectionStart(lines: readonly string[]): number | undefined {
	for (let index = 0; index < lines.length; index += 1) {
		if (tomlTableName(lines[index] ?? "") === "areg") return index;
	}
	return undefined;
}

function tomlSectionEnd(lines: readonly string[], start: number): number {
	for (let index = start + 1; index < lines.length; index += 1) {
		if (tomlTableName(lines[index] ?? "") !== null) return index;
	}
	return lines.length;
}

function tomlTableName(line: string): string | null {
	const stripped = line.trim();
	if (stripped.startsWith("[[")) {
		const closingIndex = stripped.indexOf("]]", 2);
		if (closingIndex < 0) return null;
		return stripped.slice(2, closingIndex).trim();
	}
	if (!stripped.startsWith("[")) return null;
	const closingIndex = stripped.indexOf("]");
	if (closingIndex < 0) return null;
	return stripped.slice(1, closingIndex).trim();
}

