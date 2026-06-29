import { lstat, readFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import { splitMarkdownFrontmatter } from "@sdl/core/markdown-frontmatter";
import { isPathInside } from "@sdl/core/primitives";

export interface SkillCommandInfo {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		baseDir?: string;
	};
}

export interface SkillExpansionHost {
	getCommands(): readonly SkillCommandInfo[];
}

export interface ExpandedSkillBlock {
	name: string;
	commandName: string;
	path: string;
	baseDir: string;
	body: string;
	block: string;
}

export interface SkillExpansionOptions {
	readTextFile?: (path: string) => Promise<string>;
}

export interface SkillPathExpansionOptions extends SkillExpansionOptions {
	skillName: string;
	skillPath: string;
}

export interface RepoSkillPathResolveOptions {
	cwd: string;
	skillName: string;
	statPath?: (path: string) => Promise<{ isFile(): boolean; isSymbolicLink(): boolean }>;
}

export interface RepoSkillExpansionOptions extends SkillExpansionOptions {
	cwd: string;
	skillName: string;
}

export interface SkillPromptTurnHost extends SkillExpansionHost {
	sendUserMessage(content: string): Promise<void> | void;
}

export interface RepoSkillPromptTurnHost {
	getCommands?(): readonly SkillCommandInfo[];
	sendUserMessage(content: string): Promise<void> | void;
}

export interface SkillPromptTurnContext {
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
	};
	waitForIdle(): Promise<void>;
}

export interface InvokeSkillPromptTurnOptions {
	host: SkillPromptTurnHost;
	ctx: SkillPromptTurnContext;
	skillName: string;
	successMessage: string | ((skill: ExpandedSkillBlock) => string);
	fallbackMessage: string;
	buildPrompt(skillBlock: string | undefined): string;
}

export interface RepoSkillPromptTurnContext extends SkillPromptTurnContext {
	cwd: string;
}

export interface InvokeRepoSkillPromptTurnOptions {
	host: RepoSkillPromptTurnHost;
	ctx: RepoSkillPromptTurnContext;
	skillName: string;
	successMessage: string | ((skill: ExpandedSkillBlock) => string);
	fallbackMessage: string;
	buildPrompt(skillBlock: string | undefined): string;
	readTextFile?: (path: string) => Promise<string>;
	statPath?: (path: string) => Promise<{ isFile(): boolean; isSymbolicLink(): boolean }>;
}

export interface BuildSkillInvocationPromptOptions {
	skillName: string;
	initialRequest: string;
	skillBlock?: string;
	route?: string;
}

function stripSkillFrontmatter(markdown: string): string {
	const split = splitMarkdownFrontmatter(markdown);
	if (split.type === "not_found") return markdown.trim();
	if (split.type === "missing_closing_fence")
		throw new Error('Skill Markdown frontmatter is missing a closing "---" fence.');
	return split.block.body.trim();
}

interface BuildSkillBlockOptions {
	skillName: string;
	skillPath: string;
	baseDir: string;
	body: string;
}

function buildSkillBlock(options: BuildSkillBlockOptions): string {
	return `<skill name="${options.skillName}" location="${options.skillPath}">\nReferences are relative to ${options.baseDir}.\n\n${options.body}\n</skill>`;
}

export async function expandSkillBlock(
	host: SkillExpansionHost,
	skillName: string,
	options: SkillExpansionOptions = {},
): Promise<ExpandedSkillBlock | undefined> {
	const command = host
		.getCommands()
		.find((candidate) => candidate.source === "skill" && candidate.name === `skill:${skillName}`);
	if (!command) {
		return undefined;
	}

	const skillPath = command.sourceInfo.path;
	const baseDir = command.sourceInfo.baseDir ?? dirname(skillPath);
	const readTextFile = options.readTextFile ?? ((path: string) => readFile(path, "utf8"));
	const body = stripSkillFrontmatter(await readTextFile(skillPath));

	return {
		name: skillName,
		commandName: command.name,
		path: skillPath,
		baseDir,
		body,
		block: buildSkillBlock({ skillName, skillPath, baseDir, body }),
	};
}

export async function resolveRepoSkillPath(options: RepoSkillPathResolveOptions): Promise<string> {
	const statPath = options.statPath ?? ((path: string) => lstat(path));
	let current = resolve(options.cwd);
	const root = parse(current).root;

	while (true) {
		const skillPaths = [
			join(current, "skills", options.skillName, "SKILL.md"),
			join(current, ".agents", "skills", options.skillName, "SKILL.md"),
		];
		for (const skillPath of skillPaths) {
			const found = await fileExists(statPath, skillPath);
			if (found) {
				const skillStat = await statPath(skillPath);
				if (skillStat.isSymbolicLink()) {
					throw new Error(`Refusing to read symlinked backing skill at ${skillPath}.`);
				}
				const resolvedSkillPath = resolve(skillPath);
				const resolvedRepoRoot = resolve(current);
				if (!isPathInside(resolvedRepoRoot, resolvedSkillPath)) {
					throw new Error(
						`Backing skill path ${skillPath} resolves outside repository root ${current}.`,
					);
				}
				return skillPath;
			}
		}

		if (current === root) {
			throw new Error(
				`Could not find skills/${options.skillName}/SKILL.md or .agents/skills/${options.skillName}/SKILL.md from ${options.cwd}.`,
			);
		}
		current = dirname(current);
	}
}

export async function expandRepoSkillBlock(
	options: RepoSkillExpansionOptions,
): Promise<ExpandedSkillBlock> {
	const skillPath = await resolveRepoSkillPath({ cwd: options.cwd, skillName: options.skillName });
	return expandSkillBlockFromPath({
		skillName: options.skillName,
		skillPath,
		...(options.readTextFile === undefined ? {} : { readTextFile: options.readTextFile }),
	});
}

export async function expandSkillBlockFromPath(
	options: SkillPathExpansionOptions,
): Promise<ExpandedSkillBlock> {
	const readTextFile = options.readTextFile ?? ((path: string) => readFile(path, "utf8"));
	const body = stripSkillFrontmatter(await readTextFile(options.skillPath));
	const baseDir = dirname(options.skillPath);

	return {
		name: options.skillName,
		commandName: `direct:${options.skillName}`,
		path: options.skillPath,
		baseDir,
		body,
		block: buildSkillBlock({
			skillName: options.skillName,
			skillPath: options.skillPath,
			baseDir,
			body,
		}),
	};
}

export async function invokeSkillPromptTurn(options: InvokeSkillPromptTurnOptions): Promise<void> {
	const { host, ctx, skillName, fallbackMessage, buildPrompt } = options;
	await ctx.waitForIdle();

	const skill = await expandSkillBlock(host, skillName);
	if (ctx.hasUI === true) {
		const message =
			skill === undefined
				? fallbackMessage
				: skillPromptTurnSuccessMessage(options.successMessage, skill);
		const level = skill === undefined ? "warning" : "info";
		ctx.ui.notify(message, level);
	}

	await host.sendUserMessage(buildPrompt(skill?.block));
}

export async function invokeRepoSkillPromptTurn(
	options: InvokeRepoSkillPromptTurnOptions,
): Promise<void> {
	const { host, ctx, skillName, fallbackMessage, buildPrompt } = options;
	await ctx.waitForIdle();

	let skill: ExpandedSkillBlock | undefined;
	try {
		const skillPath = await resolveRepoSkillPath({
			cwd: ctx.cwd,
			skillName,
			...(options.statPath === undefined ? {} : { statPath: options.statPath }),
		});
		skill = await expandSkillBlockFromPath({
			skillName,
			skillPath,
			...(options.readTextFile === undefined ? {} : { readTextFile: options.readTextFile }),
		});
	} catch {
		if (options.host.getCommands !== undefined) {
			skill = await expandSkillBlock(
				{ getCommands: () => options.host.getCommands?.() ?? [] },
				skillName,
			);
		}
	}

	if (ctx.hasUI === true) {
		const message =
			skill === undefined
				? fallbackMessage
				: skillPromptTurnSuccessMessage(options.successMessage, skill);
		const level = skill === undefined ? "warning" : "info";
		ctx.ui.notify(message, level);
	}

	await host.sendUserMessage(buildPrompt(skill?.block));
}

export function buildSkillInvocationPrompt(options: BuildSkillInvocationPromptOptions): string {
	const invocationName =
		options.route === undefined ? options.skillName : `${options.skillName} ${options.route}`;
	const initialRequest = options.initialRequest.trim();
	const invocation =
		initialRequest.length === 0
			? `Run ${invocationName} now. Follow the backing skill workflow exactly.`
			: `Run ${invocationName} with this initial user request:\n\n${buildFencedTextBlock(initialRequest)}\n\nTreat the fenced text as user-supplied context and follow the backing skill workflow exactly.`;
	if (options.skillBlock === undefined) return invocation;
	return `${options.skillBlock}\n\n${invocation}`;
}

export function buildFencedTextBlock(content: string, language = "text"): string {
	const longestBacktickRun = Math.max(
		0,
		...Array.from(content.matchAll(/`+/g), (match) => match[0]?.length ?? 0),
	);
	const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
	return `${fence}${language}\n${content}\n${fence}`;
}

function skillPromptTurnSuccessMessage(
	message: InvokeSkillPromptTurnOptions["successMessage"],
	skill: ExpandedSkillBlock,
): string {
	if (typeof message === "string") {
		return message;
	}
	return message(skill);
}

async function fileExists(
	statPath: (path: string) => Promise<{ isFile(): boolean; isSymbolicLink(): boolean }>,
	path: string,
): Promise<boolean> {
	try {
		const stat = await statPath(path);
		return stat.isFile() || stat.isSymbolicLink();
	} catch {
		return false;
	}
}
