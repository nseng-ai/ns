import path from "node:path";

import { negative, ok, type ClinkrExit } from "@asdl/clinkr";
import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import type { AregCliContext } from "../context.ts";
import type { AregErrorInfo, AregInitTextFileState, AregInitTextWritePlan } from "../gateways.ts";

const BOOTSTRAP_REPO = "dagster-io/asdl-tools";
const BOOTSTRAP_SKILLS = ["skill-management", "skillx"] as const;
const DEFAULT_AGENTS = ["codex", "claude-code"] as const;

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

export const initResultSchema = z.object({
	project_dir: z.string(),
	agents: z.array(z.string()),
	bootstrap_repo: z.string(),
	bootstrap_skills: z.array(z.string()),
	written_files: z.array(z.string()),
	skipped_files: z.array(skippedFileSchema),
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

type PlanResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

interface ManagedMarkers {
	start: string;
	end: string;
}

export async function runInit(ctx: AregCliContext, request: InitRequest): Promise<ClinkrExit<InitResult>> {
	const noAppend = !request.append;
	if (request.yes && noAppend) {
		return negative("--yes and --no-append cannot be used together.", emptyInitResult());
	}

	const tool = await ctx.host.checkTool({ tool: "npx", cwd: ctx.cwd, env: ctx.env });
	if (tool.type === "missing") return negative(tool.message, emptyInitResult());

	const inspection = await ctx.initProject.inspectProjectForInit({ cwd: ctx.cwd, target: request.target, env: ctx.env });
	if (inspection.targetPathState.type === "missing") return negative(`Target ${inspection.projectDir} does not exist.`, emptyInitResult(inspection.projectDir));
	if (inspection.targetPathState.type !== "directory") return negative(`${inspection.projectDir} is not a directory.`, emptyInitResult(inspection.projectDir));

	const repoRoot = await ctx.git.optionalRepoRoot({ cwd: inspection.projectDir });
	if (repoRoot.type === "error") return negative(repoRoot.error.message, emptyInitResult(inspection.projectDir));
	if (repoRoot.type === "missing") {
		return negative(`Target ${inspection.projectDir} must be a Git worktree root. Run git init first.`, emptyInitResult(inspection.projectDir));
	}
	if (repoRoot.value !== inspection.projectDir) {
		return negative(
			`Target ${inspection.projectDir} is inside a Git worktree but is not the root. Run areg init ${repoRoot.value} instead.`,
			emptyInitResult(inspection.projectDir),
		);
	}

	const agentsResult = resolveProjectAgents({ explicitAgents: request.agent, asdlToml: inspection.asdlToml, aregJson: inspection.aregJson });
	if (agentsResult.type === "error") return negative(agentsResult.message, emptyInitResult(inspection.projectDir));
	const agents = agentsResult.value;

	const planResult = await buildInitTextPlan(ctx, inspection, { agents, yes: request.yes, noAppend });
	if (planResult.type === "error") return negative(planResult.message, emptyInitResult(inspection.projectDir, agents));
	const textPlan = planResult.value;

	const install = await ctx.npxSkills.addSkills({
		sourceRepo: BOOTSTRAP_REPO,
		skillNames: BOOTSTRAP_SKILLS,
		targetAgents: agents,
		cwd: inspection.projectDir,
		env: ctx.env,
	});
	if (install.type === "error") return negative(`npx skills add failed: ${install.error.message}`, emptyInitResult(inspection.projectDir, agents));

	const apply = await ctx.initProject.applyTextWritePlan({ projectDir: inspection.projectDir, writes: textPlan.writes, env: ctx.env });
	if (!apply.ok) return negative(apply.error.message, emptyInitResult(inspection.projectDir, agents));

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

export function resolveProjectAgents(input: {
	explicitAgents: readonly string[];
	asdlToml: AregInitTextFileState;
	aregJson: AregInitTextFileState;
}): PlanResult<string[]> {
	if (input.explicitAgents.length > 0) return { type: "ok", value: [...input.explicitAgents] };
	const asdlAgents = parseAsdlAregAgentsFromState(input.asdlToml);
	if (asdlAgents.type === "error") return asdlAgents;
	if (asdlAgents.value.length > 0) return asdlAgents;
	const legacyAgents = parseLegacyAregJsonAgentsFromState(input.aregJson);
	if (legacyAgents.type === "error") return legacyAgents;
	if (legacyAgents.value.length > 0) return legacyAgents;
	return { type: "ok", value: [...DEFAULT_AGENTS] };
}

export function parseAsdlAregAgents(text: string, pathLabel = "asdl.toml"): PlanResult<string[]> {
	let data: unknown;
	try {
		data = parseToml(text);
	} catch (error) {
		return { type: "error", message: `Invalid TOML in ${pathLabel}: ${formatErrorMessage(error)}` };
	}
	if (!isRecord(data)) return { type: "ok", value: [] };
	const areg = data.areg;
	if (areg === undefined) return { type: "ok", value: [] };
	if (!isRecord(areg)) return { type: "error", message: `[areg] in ${pathLabel} must be a TOML table.` };
	const agents = areg.agents;
	if (agents === undefined) return { type: "ok", value: [] };
	if (!Array.isArray(agents)) return { type: "error", message: `${pathLabel} [areg].agents must be a string array.` };
	if (agents.length === 0) return { type: "ok", value: [] };
	const result: string[] = [];
	for (const agent of agents) {
		if (typeof agent !== "string" || agent.trim().length === 0) return { type: "error", message: `${pathLabel} [areg].agents must be a non-empty string list.` };
		result.push(agent);
	}
	return { type: "ok", value: result };
}

export function parseLegacyAregJsonAgents(text: string): PlanResult<string[]> {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (error) {
		return { type: "error", message: `Invalid JSON in areg.json: ${formatErrorMessage(error)}` };
	}
	if (!isRecord(data)) return { type: "error", message: "areg.json must contain a JSON object." };
	const agents = data.agents;
	if (!Array.isArray(agents) || agents.length === 0) return { type: "error", message: "areg.json field `agents` must be a non-empty string list." };
	const result: string[] = [];
	for (const agent of agents) {
		if (typeof agent !== "string" || agent.trim().length === 0) return { type: "error", message: "areg.json field `agents` must be a non-empty string list." };
		result.push(agent);
	}
	return { type: "ok", value: result };
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

export function managedBlockBounds(content: string, markers: ManagedMarkers, pathLabel: string): PlanResult<{ start: number; end: number } | null> {
	const startCount = countOccurrences(content, markers.start);
	const endCount = countOccurrences(content, markers.end);
	if (startCount === 0 && endCount === 0) return { type: "ok", value: null };
	if (startCount !== 1 || endCount !== 1) return malformedManagedBlock(pathLabel);
	const start = content.indexOf(markers.start);
	const endMarkerStart = content.indexOf(markers.end);
	if (endMarkerStart < start) return malformedManagedBlock(pathLabel);
	return { type: "ok", value: { start, end: endMarkerStart + markers.end.length } };
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
		agentsMd: AregInitTextFileState;
		claudeMd: AregInitTextFileState;
		asdlToml: AregInitTextFileState;
		claudeDir: { type: string; target?: string };
		claudeSettings: AregInitTextFileState;
	},
	options: { agents: readonly string[]; yes: boolean; noAppend: boolean },
): Promise<PlanResult<InitTextPlan>> {
	const writes: AregInitTextWritePlan[] = [];
	const skippedFiles: SkippedFile[] = [];
	const asdl = planAsdlToml(inspection.asdlToml, options.agents);
	if (asdl.type === "error") return asdl;
	writes.push(asdl.value);

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
	if (agents.type === "error") return agents;
	addTextPlan(agents.value, writes, skippedFiles);

	const claude = await planClaudeMd(ctx, inspection.projectDir, inspection.claudeMd, { yes: options.yes, noAppend: options.noAppend });
	if (claude.type === "error") return claude;
	addTextPlan(claude.value, writes, skippedFiles);

	const settings = planSettings(inspection.claudeDir, inspection.claudeSettings);
	if (settings.type === "error") return settings;
	addTextPlan(settings.value, writes, skippedFiles);
	return { type: "ok", value: { writes, skippedFiles } };
}

function parseAsdlAregAgentsFromState(state: AregInitTextFileState): PlanResult<string[]> {
	if (state.type === "missing") return { type: "ok", value: [] };
	if (state.type !== "file") return rejectTextState("asdl.toml", state, "asdl.toml");
	return parseAsdlAregAgents(state.text, "asdl.toml");
}

function parseLegacyAregJsonAgentsFromState(state: AregInitTextFileState): PlanResult<string[]> {
	if (state.type === "missing") return { type: "ok", value: [] };
	if (state.type !== "file") return rejectTextState("areg.json", state, "areg.json");
	return parseLegacyAregJsonAgents(state.text);
}

function planAsdlToml(state: AregInitTextFileState, agents: readonly string[]): PlanResult<AregInitTextWritePlan> {
	if (state.type === "missing") return { type: "ok", value: writePlan("asdl.toml", renderAregSection(agents), "asdl.toml") };
	if (state.type !== "file") return rejectTextState("asdl.toml", state, "asdl.toml");
	const parsed = parseAsdlAregAgents(state.text, "asdl.toml");
	if (parsed.type === "error") return parsed;
	return { type: "ok", value: writePlan("asdl.toml", replaceOrAppendAregSection(state.text, agents), "asdl.toml") };
}

async function planClaudeMd(
	ctx: AregCliContext,
	projectDir: string,
	state: AregInitTextFileState,
	options: { yes: boolean; noAppend: boolean },
): Promise<PlanResult<AregInitTextWritePlan | SkippedFile>> {
	let includeAgentsRef = true;
	if (state.type === "file") {
		const outside = contentWithoutManagedBlock(state.text, { start: CLAUDE_BLOCK_START, end: CLAUDE_BLOCK_END }, "CLAUDE.md");
		if (outside.type === "error") return outside;
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
		state: AregInitTextFileState;
		newFileContent: string;
		block: string;
		markers: ManagedMarkers;
		yes: boolean;
		noAppend: boolean;
		appendPrompt: string;
		updatePrompt: string;
	},
): Promise<PlanResult<AregInitTextWritePlan | SkippedFile>> {
	if (input.state.type === "missing") return { type: "ok", value: writePlan(input.path, input.newFileContent, input.path) };
	if (input.state.type !== "file") return rejectTextState(input.path, input.state, input.path);
	const bounds = managedBlockBounds(input.state.text, input.markers, input.path);
	if (bounds.type === "error") return bounds;
	if (bounds.value === null) {
		if (input.noAppend) return { type: "ok", value: { path: input.path, reason: "--no-append skips existing file without managed block" } };
		if (!input.yes && !(await ctx.prompt.confirm({ message: input.appendPrompt, defaultValue: false }))) {
			return { type: "ok", value: { path: input.path, reason: "user declined adding managed block" } };
		}
		return { type: "ok", value: writePlan(input.path, appendBlock(input.state.text, input.block), input.path) };
	}
	const currentBlock = input.state.text.slice(bounds.value.start, bounds.value.end);
	if (currentBlock === input.block) return { type: "ok", value: { path: input.path, reason: "managed block is already current" } };
	if (input.noAppend) return { type: "ok", value: { path: input.path, reason: "--no-append skips existing managed block replacement" } };
	if (!input.yes && !(await ctx.prompt.confirm({ message: input.updatePrompt, defaultValue: false }))) {
		return { type: "ok", value: { path: input.path, reason: "user declined replacing managed block" } };
	}
	return {
		type: "ok",
		value: writePlan(input.path, `${input.state.text.slice(0, bounds.value.start)}${input.block}${input.state.text.slice(bounds.value.end)}`, input.path),
	};
}

function contentWithoutManagedBlock(content: string, markers: ManagedMarkers, pathLabel: string): PlanResult<string> {
	const bounds = managedBlockBounds(content, markers, pathLabel);
	if (bounds.type === "error") return bounds;
	if (bounds.value === null) return { type: "ok", value: content };
	return { type: "ok", value: `${content.slice(0, bounds.value.start)}${content.slice(bounds.value.end)}` };
}

function planSettings(claudeDirState: { type: string; target?: string }, settingsState: AregInitTextFileState): PlanResult<AregInitTextWritePlan | SkippedFile> {
	if (claudeDirState.type === "symlink") return { type: "error", message: `.claude at .claude is a symlink; refusing to manage it.` };
	if (claudeDirState.type !== "missing" && claudeDirState.type !== "directory") return { type: "error", message: ".claude exists but is not a directory." };
	if (settingsState.type === "missing") return { type: "ok", value: writePlan(".claude/settings.local.json", SETTINGS_LOCAL_JSON, "settings.local.json", true) };
	if (settingsState.type !== "file") return rejectTextState(".claude/settings.local.json", settingsState, "settings.local.json");
	return { type: "ok", value: { path: ".claude/settings.local.json", reason: "existing settings file is preserved" } };
}

function addTextPlan(plan: AregInitTextWritePlan | SkippedFile, writes: AregInitTextWritePlan[], skippedFiles: SkippedFile[]): void {
	if ("relativePath" in plan) {
		writes.push(plan);
		return;
	}
	skippedFiles.push({ ...plan });
}

function writePlan(relativePath: AregInitTextWritePlan["relativePath"], content: string, description: string, createParent = false): AregInitTextWritePlan {
	return { relativePath, content, description, createParent };
}

function rejectTextState<T>(pathLabel: string, state: Exclude<AregInitTextFileState, { type: "file" } | { type: "missing" }>, description: string): PlanResult<T> {
	if (state.type === "symlink") return { type: "error", message: `${description} at ${pathLabel} is a symlink; refusing to manage it.` };
	if (state.type === "directory") return { type: "error", message: `${pathLabel} exists but is not a file.` };
	if (state.type === "unreadable") return { type: "error", message: `Failed to read ${pathLabel}: ${state.message}` };
	return { type: "error", message: `${pathLabel} exists but is not a file.` };
}

function malformedManagedBlock<T>(pathLabel: string): PlanResult<T> {
	return { type: "error", message: `${pathLabel} has a malformed areg-managed block. Fix the markers manually.` };
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

function countOccurrences(content: string, needle: string): number {
	let count = 0;
	let start = 0;
	while (true) {
		const index = content.indexOf(needle, start);
		if (index === -1) return count;
		count += 1;
		start = index + needle.length;
	}
}

function emptyInitResult(projectDir = "", agents: readonly string[] = []): InitResult {
	return {
		project_dir: projectDir,
		agents: [...agents],
		bootstrap_repo: BOOTSTRAP_REPO,
		bootstrap_skills: [...BOOTSTRAP_SKILLS],
		written_files: [],
		skipped_files: [],
	};
}

export function errorInfo(code: string, message: string, displayCommand?: string | undefined): AregErrorInfo {
	return displayCommand === undefined ? { code, message } : { code, message, displayCommand };
}
