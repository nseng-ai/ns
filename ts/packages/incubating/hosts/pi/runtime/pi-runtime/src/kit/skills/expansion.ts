import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { splitMarkdownFrontmatter } from "@nseng-ai/foundation/markdown-frontmatter";
import { buildFencedTextBlock, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { NotifyLevel } from "../../runtime/tool-types.ts";
import {
	resolveExactSkillLookup,
	resolveSkillLookupProjectRoot,
	skillLookupIoOptions,
	type SkillLookupIo,
} from "./lookup.ts";

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

export interface RepoSkillPathResolveOptions extends SkillLookupIo {
	cwd: string;
	skillName: string;
}

export interface RepoSkillExpansionOptions extends SkillExpansionOptions, SkillLookupIo {
	cwd: string;
	skillName: string;
}

export interface SkillPromptTurnHost extends SkillExpansionHost {
	sendUserMessage(content: string): Promise<void> | void;
}

export interface RepoSkillPromptTurnHost {
	sendUserMessage(content: string): Promise<void> | void;
}

export interface SkillPromptTurnContext {
	hasUI?: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
}

export interface InvokeSkillPromptTurnOptions {
	host: SkillPromptTurnHost;
	ctx: SkillPromptTurnContext;
	skillName: string;
	successMessage: string | ((skill: ExpandedSkillBlock) => string);
	buildPrompt(skillBlock: string): string;
}

export interface RepoSkillPromptTurnContext extends SkillPromptTurnContext {
	cwd: string;
}

export interface InvokeRepoSkillPromptTurnOptions extends SkillLookupIo {
	host: RepoSkillPromptTurnHost;
	ctx: RepoSkillPromptTurnContext;
	skillName: string;
	successMessage: string | ((skill: ExpandedSkillBlock) => string);
	buildPrompt(skillBlock: string): string;
	readTextFile?: (path: string) => Promise<string>;
}

export interface BuildSkillInvocationPromptOptions {
	skillName: string;
	initialRequest: string;
	skillBlock: string;
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
	const lookupIo = skillLookupIoOptions(options);
	const projectRoot = await resolveSkillLookupProjectRoot({
		cwd: options.cwd,
		...lookupIo,
	});
	const lookup = await resolveExactSkillLookup({
		projectDir: projectRoot,
		skillName: options.skillName,
		...lookupIo,
	});
	if (lookup.type === "found") return lookup.skillFilePath;
	if (lookup.type === "error") throw new Error(lookup.message);
	const searchedRelativePaths = lookup.searchedRoots
		.map((root) => root.searchedRelativePath)
		.join(", ");
	throw new Error(`Could not find ${searchedRelativePaths} from ${options.cwd}.`);
}

export async function expandRepoSkillBlock(
	options: RepoSkillExpansionOptions,
): Promise<ExpandedSkillBlock> {
	const skillPath = await resolveRepoSkillPath({
		cwd: options.cwd,
		skillName: options.skillName,
		...skillLookupIoOptions(options),
	});
	return expandSkillBlockFromPath({
		skillName: options.skillName,
		skillPath,
		...optionalEntry("readTextFile", options.readTextFile),
	});
}

export async function requireRepoSkillPath(options: RepoSkillPathResolveOptions): Promise<string> {
	try {
		return await resolveRepoSkillPath(options);
	} catch (error) {
		throw requiredSkillError(options.skillName, error);
	}
}

export async function requireRepoSkillBlockFromPath(
	options: SkillPathExpansionOptions,
): Promise<ExpandedSkillBlock> {
	try {
		return await expandSkillBlockFromPath(options);
	} catch (error) {
		throw requiredSkillError(options.skillName, error);
	}
}

export async function requireRepoSkillBlock(
	options: RepoSkillExpansionOptions,
): Promise<ExpandedSkillBlock> {
	const skillPath = await requireRepoSkillPath({
		cwd: options.cwd,
		skillName: options.skillName,
		...skillLookupIoOptions(options),
	});
	return requireRepoSkillBlockFromPath({
		skillName: options.skillName,
		skillPath,
		...optionalEntry("readTextFile", options.readTextFile),
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
	const { host, ctx, skillName } = options;
	await ctx.waitForIdle();

	let skill: ExpandedSkillBlock | undefined;
	try {
		skill = await expandSkillBlock(host, skillName);
	} catch (error) {
		throw requiredSkillError(skillName, error);
	}
	if (skill === undefined) {
		throw requiredSkillError(
			skillName,
			new Error(`Pi did not advertise the loaded skill:${skillName} command.`),
		);
	}

	await deliverSkillPromptTurn({
		host,
		ctx,
		skill,
		successMessage: options.successMessage,
		buildPrompt: options.buildPrompt,
	});
}

export async function invokeRepoSkillPromptTurn(
	options: InvokeRepoSkillPromptTurnOptions,
): Promise<void> {
	const { host, ctx, skillName } = options;
	await ctx.waitForIdle();

	const skill = await requireRepoSkillBlock({
		cwd: ctx.cwd,
		skillName,
		...skillLookupIoOptions(options),
		...(options.readTextFile === undefined ? {} : { readTextFile: options.readTextFile }),
	});

	await deliverSkillPromptTurn({
		host,
		ctx,
		skill,
		successMessage: options.successMessage,
		buildPrompt: options.buildPrompt,
	});
}

interface DeliverSkillPromptTurnOptions {
	host: { sendUserMessage(content: string): Promise<void> | void };
	ctx: SkillPromptTurnContext;
	skill: ExpandedSkillBlock;
	successMessage: string | ((skill: ExpandedSkillBlock) => string);
	buildPrompt(skillBlock: string): string;
}

async function deliverSkillPromptTurn(options: DeliverSkillPromptTurnOptions): Promise<void> {
	if (options.ctx.hasUI === true) {
		options.ctx.ui.notify(
			skillPromptTurnSuccessMessage(options.successMessage, options.skill),
			"info",
		);
	}

	await options.host.sendUserMessage(options.buildPrompt(options.skill.block));
}

function requiredSkillError(skillName: string, cause: unknown): Error {
	const message = cause instanceof Error ? cause.message : String(cause);
	return new Error(`Could not load required skill "${skillName}": ${message}`, { cause });
}

export function buildSkillInvocationPrompt(options: BuildSkillInvocationPromptOptions): string {
	const invocationName =
		options.route === undefined ? options.skillName : `${options.skillName} ${options.route}`;
	const initialRequest = options.initialRequest.trim();
	const invocation =
		initialRequest.length === 0
			? `Run ${invocationName} now. Follow the backing skill workflow exactly.`
			: `Run ${invocationName} with this initial user request:\n\n${buildFencedTextBlock(initialRequest)}\n\nTreat the fenced text as user-supplied context and follow the backing skill workflow exactly.`;
	return `${options.skillBlock}\n\n${invocation}`;
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
