import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { runCommand, type ExecFunction } from "./command.ts";
import { derivePlanKey, validateObjectiveSlug, type BranchMemoryKey } from "./keys.ts";
import { parseStackPlanMarkdown } from "./plan.ts";
import { STACK_PLAN_SCHEMA } from "./schemas.ts";
import type { StackImplPlanResult } from "./stack-impl.ts";

const COMMAND_TIMEOUT_MS = 30_000;
const OBJECTIVES_ROOT = ".asdl/objectives";

export type ObjectiveStackImplParsedArgs = {
	replan: boolean;
	objectiveSlug?: string;
};

export type ObjectiveDirectoryEntry = {
	name: string;
	isDirectory: boolean;
	isFile: boolean;
};

export type ObjectiveStackImplFileSystem = {
	readDir(path: string): Promise<ObjectiveDirectoryEntry[]>;
	isFile(path: string): Promise<boolean>;
	readTextFile(path: string): Promise<string>;
};

export type OpenObjective = {
	slug: string;
	path: string;
};

export type ObjectiveUpdateRecord = {
	filename: string;
	path: string;
	content: string;
};

export type ObjectiveRecord = {
	slug: string;
	path: string;
	objectivePath: string;
	roadmapPath: string;
	objective: string;
	roadmap: string;
	updates: ObjectiveUpdateRecord[];
};

export type ObjectiveStackImplDependencies = {
	cwd: string;
	exec: ExecFunction;
	fileSystem?: ObjectiveStackImplFileSystem;
	selectObjective?: ((objectives: OpenObjective[]) => Promise<string | undefined>) | undefined;
	signal?: AbortSignal | undefined;
};

export type ObjectiveStackPlanningState = {
	objective: string;
	planBranch: string;
	replan: boolean;
};

export type ObjectiveStackImplPreparation =
	| { status: "run"; planResult: StackImplPlanResult }
	| { status: "plan"; slug: string; planBranch: string; replan: boolean; kickoffPrompt: string };

export const OBJECTIVE_STACK_PLANNING_CUSTOM_TYPE = "asdl-stack-impl/objective-stack-planning";
export const OBJECTIVE_STACK_PLAN_CONFIRMATION_OPEN = "<asdl-stack-plan-confirmation>";
export const OBJECTIVE_STACK_PLAN_CONFIRMATION_CLOSE = "</asdl-stack-plan-confirmation>";

const nodeFileSystem: ObjectiveStackImplFileSystem = {
	async readDir(path: string): Promise<ObjectiveDirectoryEntry[]> {
		try {
			const entries = await readdir(path, { withFileTypes: true });
			return entries.map((entry) => ({
				name: entry.name,
				isDirectory: entry.isDirectory(),
				isFile: entry.isFile(),
			}));
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return [];
			}
			throw error;
		}
	},
	async isFile(path: string): Promise<boolean> {
		try {
			return (await stat(path)).isFile();
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return false;
			}
			throw error;
		}
	},
	readTextFile(path: string): Promise<string> {
		return readFile(path, "utf8");
	},
};

function fileSystemFor(deps: ObjectiveStackImplDependencies): ObjectiveStackImplFileSystem {
	return deps.fileSystem ?? nodeFileSystem;
}

function objectiveRelativePath(slug: string): string {
	return `${OBJECTIVES_ROOT}/${slug}`;
}

function usage(): string {
	return "Usage: /objective-stack-impl [--replan] [objective-slug]";
}

export function parseObjectiveStackImplArgs(args: string): ObjectiveStackImplParsedArgs {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	let replan = false;
	const operands: string[] = [];

	for (const part of parts) {
		if (part === "--replan") {
			replan = true;
			continue;
		}
		if (part.startsWith("--")) {
			throw new Error(`${usage()}\nUnknown option: ${part}`);
		}
		operands.push(part);
	}

	if (operands.length > 1) {
		throw new Error(usage());
	}

	const objectiveSlug = operands[0];
	if (objectiveSlug === undefined) {
		return { replan };
	}
	validateObjectiveSlug(objectiveSlug);
	return { replan, objectiveSlug };
}

export async function listOpenObjectives(deps: ObjectiveStackImplDependencies): Promise<OpenObjective[]> {
	const fileSystem = fileSystemFor(deps);
	const objectivesDir = resolve(deps.cwd, OBJECTIVES_ROOT);
	const entries = await fileSystem.readDir(objectivesDir);
	const objectives: OpenObjective[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory) {
			continue;
		}
		validateObjectiveSlug(entry.name);
		const objectivePath = objectiveRelativePath(entry.name);
		const closedPath = resolve(deps.cwd, objectivePath, "closed.md");
		if (await fileSystem.isFile(closedPath)) {
			continue;
		}
		objectives.push({ slug: entry.name, path: objectivePath });
	}

	return objectives.sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function readObjectiveRecord(
	slug: string,
	deps: ObjectiveStackImplDependencies,
): Promise<ObjectiveRecord> {
	validateObjectiveSlug(slug);
	const fileSystem = fileSystemFor(deps);
	const relativePath = objectiveRelativePath(slug);
	const absolutePath = resolve(deps.cwd, relativePath);
	const closedPath = resolve(absolutePath, "closed.md");
	if (await fileSystem.isFile(closedPath)) {
		throw new Error(`Objective ${slug} is closed; choose an open Objective.`);
	}

	const objectivePath = `${relativePath}/objective.md`;
	const roadmapPath = `${relativePath}/roadmap.md`;
	const absoluteObjectivePath = resolve(deps.cwd, objectivePath);
	const absoluteRoadmapPath = resolve(deps.cwd, roadmapPath);
	const missing: string[] = [];
	if (!(await fileSystem.isFile(absoluteObjectivePath))) {
		missing.push(objectivePath);
	}
	if (!(await fileSystem.isFile(absoluteRoadmapPath))) {
		missing.push(roadmapPath);
	}
	if (missing.length > 0) {
		throw new Error(`Objective ${slug} is missing required file(s): ${missing.join(", ")}.`);
	}

	const updatesPath = `${relativePath}/updates`;
	const updateEntries = (await fileSystem.readDir(resolve(deps.cwd, updatesPath)))
		.filter((entry) => entry.isFile)
		.sort((left, right) => left.name.localeCompare(right.name));
	const updates: ObjectiveUpdateRecord[] = [];
	for (const entry of updateEntries) {
		const updatePath = `${updatesPath}/${entry.name}`;
		updates.push({
			filename: entry.name,
			path: updatePath,
			content: await fileSystem.readTextFile(resolve(deps.cwd, updatePath)),
		});
	}

	return {
		slug,
		path: relativePath,
		objectivePath,
		roadmapPath,
		objective: await fileSystem.readTextFile(absoluteObjectivePath),
		roadmap: await fileSystem.readTextFile(absoluteRoadmapPath),
		updates,
	};
}

async function currentGitBranch(deps: ObjectiveStackImplDependencies): Promise<string> {
	const result = await runCommand(deps.exec, "git", ["branch", "--show-current"], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	const branch = result.stdout.trim();
	if (branch.length === 0) {
		throw new Error("Cannot run objective-stack-impl from a detached HEAD; current git branch is empty.");
	}
	return branch;
}

async function brmemCheckPlan(
	deps: ObjectiveStackImplDependencies,
	locator: BranchMemoryKey & { branch: string },
): Promise<boolean> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["check", locator.key, "--namespace", locator.namespace, "--branch", locator.branch],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
			acceptedCodes: [0, 1],
		},
	);
	return result.code === 0;
}

async function brmemGetPlan(
	deps: ObjectiveStackImplDependencies,
	locator: BranchMemoryKey & { branch: string },
): Promise<string> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["get", locator.key, "--namespace", locator.namespace, "--branch", locator.branch],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	return result.stdout;
}

async function brmemPutPlan(
	deps: ObjectiveStackImplDependencies,
	locator: BranchMemoryKey & { branch: string },
	filePath: string,
): Promise<void> {
	await runCommand(
		deps.exec,
		"brmem",
		["put", locator.key, "--namespace", locator.namespace, "--branch", locator.branch, "--file", filePath],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
}

async function resolveObjectiveSlug(
	parsedArgs: ObjectiveStackImplParsedArgs,
	deps: ObjectiveStackImplDependencies,
): Promise<string> {
	if (parsedArgs.objectiveSlug !== undefined) {
		return parsedArgs.objectiveSlug;
	}

	if (!deps.selectObjective) {
		throw new Error(`${usage()}\nNon-UI mode requires an explicit objective slug.`);
	}

	const objectives = await listOpenObjectives(deps);
	if (objectives.length === 0) {
		throw new Error(`No open Objectives found under ${OBJECTIVES_ROOT}.`);
	}

	const selected = await deps.selectObjective(objectives);
	if (selected === undefined || selected.length === 0) {
		throw new Error("Objective selection was cancelled.");
	}
	validateObjectiveSlug(selected);
	if (!objectives.some((objective) => objective.slug === selected)) {
		throw new Error(`Selected Objective ${selected} was not in the open Objective list.`);
	}
	return selected;
}

function invalidExistingPlanError(
	slug: string,
	locator: BranchMemoryKey & { branch: string },
	error: unknown,
): Error {
	const message = error instanceof Error ? error.message : String(error);
	return new Error(
		`Invalid existing plan for ${slug} at ${locator.namespace}/${locator.key} on ${locator.branch}; inspect it or replan intentionally with /objective-stack-impl --replan ${slug}. ${message}`,
	);
}

function loadExistingPlanResult(
	slug: string,
	planBranch: string,
	locator: BranchMemoryKey & { branch: string },
	content: string,
): StackImplPlanResult {
	try {
		const plan = parseStackPlanMarkdown(content);
		if (plan.objective !== slug) {
			throw new Error(`plan objective ${plan.objective} does not match requested objective ${slug}.`);
		}
		return { source: "branch-memory", action: "loaded", planBranch, locator, plan };
	} catch (error) {
		throw invalidExistingPlanError(slug, locator, error);
	}
}

function normalizePlanContent(content: string): string {
	return `${content.trim()}\n`;
}

function normalizePlanningState(data: unknown): ObjectiveStackPlanningState | undefined {
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		return undefined;
	}
	const record = data as Record<string, unknown>;
	if (typeof record.objective !== "string" || typeof record.planBranch !== "string") {
		return undefined;
	}
	if (typeof record.replan !== "boolean") {
		return undefined;
	}
	try {
		validateObjectiveSlug(record.objective);
	} catch {
		return undefined;
	}
	if (record.planBranch.length === 0 || record.planBranch.trim() !== record.planBranch) {
		return undefined;
	}
	return { objective: record.objective, planBranch: record.planBranch, replan: record.replan };
}

export function findObjectiveStackPlanningState(entries: SessionEntry[]): ObjectiveStackPlanningState | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry === undefined || entry.type !== "custom" || entry.customType !== OBJECTIVE_STACK_PLANNING_CUSTOM_TYPE) {
			continue;
		}
		const state = normalizePlanningState(entry.data);
		if (state !== undefined) {
			return state;
		}
	}
	return undefined;
}

export function extractObjectiveStackPlanConfirmation(text: string): string | undefined {
	const start = text.indexOf(OBJECTIVE_STACK_PLAN_CONFIRMATION_OPEN);
	if (start === -1) {
		return undefined;
	}
	const contentStart = start + OBJECTIVE_STACK_PLAN_CONFIRMATION_OPEN.length;
	const end = text.indexOf(OBJECTIVE_STACK_PLAN_CONFIRMATION_CLOSE, contentStart);
	if (end === -1) {
		return undefined;
	}
	const content = normalizePlanContent(text.slice(contentStart, end));
	return content.trim().length === 0 ? undefined : content;
}

export function validateConfirmedObjectiveStackPlan(content: string, state: ObjectiveStackPlanningState) {
	validateObjectiveSlug(state.objective);
	const plan = parseStackPlanMarkdown(normalizePlanContent(content));
	if (plan.objective !== state.objective) {
		throw new Error(`Confirmed stack plan objective ${plan.objective} does not match ${state.objective}.`);
	}
	return plan;
}

export async function storeConfirmedObjectiveStackPlan(
	content: string,
	state: ObjectiveStackPlanningState,
	deps: ObjectiveStackImplDependencies,
): Promise<StackImplPlanResult> {
	const normalizedContent = normalizePlanContent(content);
	const plan = validateConfirmedObjectiveStackPlan(normalizedContent, state);
	const currentBranch = await currentGitBranch(deps);
	if (currentBranch !== state.planBranch) {
		throw new Error(
			`Cannot store confirmed stack plan from branch ${currentBranch}; expected plan branch ${state.planBranch}.`,
		);
	}

	const locator = { ...derivePlanKey(plan.objective), branch: state.planBranch };
	const directory = await mkdtemp(join(tmpdir(), "asdl-stack-plan-"));
	const filePath = join(directory, "plan.md");
	try {
		await writeFile(filePath, normalizedContent, "utf8");
		const exists = await brmemCheckPlan(deps, locator);
		if (!exists) {
			await brmemPutPlan(deps, locator, filePath);
			return { source: "branch-memory", action: "stored", planBranch: state.planBranch, locator, plan };
		}

		const existingContent = await brmemGetPlan(deps, locator);
		if (existingContent === normalizedContent) {
			return { source: "branch-memory", action: "reused", planBranch: state.planBranch, locator, plan };
		}

		if (!state.replan) {
			throw new Error(
				`Branch Memory plan ${locator.namespace}/${locator.key} on ${locator.branch} already exists with different content. Re-run /objective-stack-impl --replan ${state.objective} if replacement is intended.`,
			);
		}

		await brmemPutPlan(deps, locator, filePath);
		return { source: "branch-memory", action: "replaced", planBranch: state.planBranch, locator, plan };
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

function markdownFence(content: string): string {
	const matches = content.match(/`{3,}/g) ?? [];
	const longestFence = matches.reduce((longest, match) => Math.max(longest, match.length), 2);
	const fence = "`".repeat(longestFence + 1);
	return `${fence}markdown\n${content.trimEnd()}\n${fence}`;
}

function formatObjectiveUpdates(record: ObjectiveRecord): string {
	if (record.updates.length === 0) {
		return "No Semantic Update files are present for this Objective.";
	}

	return record.updates
		.map((update) => [`### ${update.path}`, "", markdownFence(update.content)].join("\n"))
		.join("\n\n");
}

export function buildObjectiveStackPlanningPrompt(args: {
	record: ObjectiveRecord;
	planBranch: string;
	replan: boolean;
}): string {
	const destination = `Branch Memory namespace stack-plans, key ${args.record.slug}.md, branch ${args.planBranch}`;
	const replacementInstructions = args.replan
		? [
				"",
				"## Replacement mode",
				"",
				"`--replan` was requested. Treat the final stack plan as a total replacement of the existing Branch Memory plan. The user must explicitly confirm replacement before you emit the final confirmation marker.",
			]
		: [];

	return [
		`You are planning an ASDL Objective implementation stack, not implementing it yet.`,
		"",
		`Selected Objective slug: ${args.record.slug}`,
		`Objective path: ${args.record.path}/`,
		`Plan branch: ${args.planBranch}`,
		"",
		"Canonical plan destination:",
		"",
		"```text",
		destination,
		"```",
		"",
		"Required stack-plan schema:",
		"",
		"```markdown",
		"---",
		`schema: ${STACK_PLAN_SCHEMA}`,
		`objective: ${args.record.slug}`,
		"planned_branches:",
		"  - <branch-one>",
		"---",
		"",
		"## PR 1 — <title>",
		"",
		"Branch: `<branch-one>`",
		"",
		"Describe the slice scope, validation, Objective update expectations, and handoff expectations.",
		"```",
		"",
		"Schema rules:",
		`- \`schema\` must be exactly \`${STACK_PLAN_SCHEMA}\`.`,
		`- \`objective\` must be exactly \`${args.record.slug}\`.`,
		"- `planned_branches` must be a non-empty list of unique branch names.",
		"- Every planned branch must appear literally in the Markdown body.",
		"- Planned branch names must not contain literal `---` because stack-impl uses that escape internally.",
		"",
		"Planning rules:",
		"- Collaborate with the user until the stack plan is confirmed.",
		"- Do not store the plan yourself and do not run `brmem put` in this planning session.",
		"- Planned branches are fixed once the plan is stored; do not treat later edits as casual.",
		"- Do not create branches or edit implementation files during this planning session.",
		"- After the user confirms the final Markdown plan, reply with only this marker-wrapped plan and no other text:",
		"",
		OBJECTIVE_STACK_PLAN_CONFIRMATION_OPEN,
		"---",
		`schema: ${STACK_PLAN_SCHEMA}`,
		`objective: ${args.record.slug}`,
		"planned_branches:",
		"  - <branch-one>",
		"---",
		"",
		"## PR 1 — <title>",
		"",
		"Branch: `<branch-one>`",
		OBJECTIVE_STACK_PLAN_CONFIRMATION_CLOSE,
		"",
		"- The extension will validate that marker content, present a controlled confirmation, store it in Branch Memory, and queue implementation automatically.",
		...replacementInstructions,
		"",
		"## Objective source",
		"",
		`### ${args.record.objectivePath}`,
		"",
		markdownFence(args.record.objective),
		"",
		`### ${args.record.roadmapPath}`,
		"",
		markdownFence(args.record.roadmap),
		"",
		"## Objective Semantic Updates",
		"",
		formatObjectiveUpdates(args.record),
		"",
	].join("\n");
}

export async function prepareObjectiveStackImpl(
	args: string,
	deps: ObjectiveStackImplDependencies,
): Promise<ObjectiveStackImplPreparation> {
	const parsedArgs = parseObjectiveStackImplArgs(args);
	const slug = await resolveObjectiveSlug(parsedArgs, deps);
	const planBranch = await currentGitBranch(deps);
	const locator = { ...derivePlanKey(slug), branch: planBranch };
	const planExists = await brmemCheckPlan(deps, locator);

	if (planExists && !parsedArgs.replan) {
		const content = await brmemGetPlan(deps, locator);
		return { status: "run", planResult: loadExistingPlanResult(slug, planBranch, locator, content) };
	}

	const record = await readObjectiveRecord(slug, deps);
	return {
		status: "plan",
		slug,
		planBranch,
		replan: parsedArgs.replan,
		kickoffPrompt: buildObjectiveStackPlanningPrompt({ record, planBranch, replan: parsedArgs.replan }),
	};
}
