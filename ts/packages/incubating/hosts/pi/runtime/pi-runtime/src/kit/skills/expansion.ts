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

export interface EffectiveSkillInfo {
	name: string;
	filePath: string;
	baseDir: string;
}

export interface EffectiveSkillInventoryHost {
	getSystemPromptOptions(): {
		skills?: readonly EffectiveSkillInfo[];
	};
}

export interface RequiredEffectiveSkill {
	readonly name: string;
	readonly filePath: string;
	readonly baseDir: string;
	load(): Promise<ExpandedSkillBlock>;
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

export interface EffectiveSkillPromptTurnHost {
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

export interface InvokeEffectiveSkillPromptTurnOptions extends SkillExpansionOptions {
	host: EffectiveSkillPromptTurnHost;
	ctx: SkillPromptTurnContext & EffectiveSkillInventoryHost;
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

export function captureRequiredEffectiveSkill(
	host: EffectiveSkillInventoryHost,
	skillName: string,
	options: SkillExpansionOptions = {},
): RequiredEffectiveSkill {
	try {
		const matches = (host.getSystemPromptOptions().skills ?? []).filter(
			(candidate) => candidate.name === skillName,
		);
		if (matches.length === 0) {
			throw new Error("Pi did not include the skill in its effective skill inventory.");
		}
		if (matches.length !== 1) {
			throw new Error(
				`Effective skill inventory contains ${matches.length} entries named "${skillName}".`,
			);
		}
		const match = matches[0];
		if (match === undefined) throw new Error("Effective skill selection invariant failed.");
		const name = match.name;
		const filePath = match.filePath;
		const baseDir = match.baseDir;
		const readTextFile = options.readTextFile ?? ((path: string) => readFile(path, "utf8"));
		return Object.freeze({
			name,
			filePath,
			baseDir,
			async load(): Promise<ExpandedSkillBlock> {
				try {
					const body = stripSkillFrontmatter(await readTextFile(filePath));
					return {
						name,
						commandName: `effective:${name}`,
						path: filePath,
						baseDir,
						body,
						block: buildSkillBlock({ skillName: name, skillPath: filePath, baseDir, body }),
					};
				} catch (error) {
					throw requiredSkillError(name, error);
				}
			},
		});
	} catch (error) {
		throw requiredSkillError(skillName, error);
	}
}

export async function expandSkillBlock(
	host: SkillExpansionHost,
	skillName: string,
	options: SkillExpansionOptions = {},
): Promise<ExpandedSkillBlock | undefined> {
	const command = host
		.getCommands()
		.find((candidate) => candidate.source === "skill" && candidate.name === `skill:${skillName}`);
	if (command === undefined) return undefined;
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

export async function invokeSkillPromptTurn(
	options: Omit<InvokeEffectiveSkillPromptTurnOptions, "ctx" | "host"> & {
		host: EffectiveSkillPromptTurnHost & SkillExpansionHost;
		ctx: SkillPromptTurnContext;
	},
): Promise<void> {
	await options.ctx.waitForIdle();
	let skill: ExpandedSkillBlock | undefined;
	try {
		skill = await expandSkillBlock(options.host, options.skillName, options);
	} catch (error) {
		throw requiredSkillError(options.skillName, error);
	}
	if (skill === undefined) {
		throw requiredSkillError(
			options.skillName,
			new Error(`Pi did not advertise the loaded skill:${options.skillName} command.`),
		);
	}
	await deliverSkillPromptTurn({
		host: options.host,
		ctx: options.ctx,
		skill,
		successMessage: options.successMessage,
		buildPrompt: options.buildPrompt,
	});
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

export async function invokeEffectiveSkillPromptTurn(
	options: InvokeEffectiveSkillPromptTurnOptions,
): Promise<void> {
	const { host, ctx, skillName } = options;
	const requiredSkill = captureRequiredEffectiveSkill(ctx, skillName, {
		...optionalEntry("readTextFile", options.readTextFile),
	});
	await ctx.waitForIdle();
	const skill = await requiredSkill.load();

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
		...optionalEntry("readTextFile", options.readTextFile),
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
	message: InvokeEffectiveSkillPromptTurnOptions["successMessage"],
	skill: ExpandedSkillBlock,
): string {
	if (typeof message === "string") {
		return message;
	}
	return message(skill);
}
