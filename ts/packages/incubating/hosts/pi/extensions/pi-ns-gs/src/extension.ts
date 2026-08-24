import process from "node:process";

import {
	GS_AUTOBRANCH_COMMAND,
	GS_RESTACK_RESOLVE_COMMAND,
	gsAutobranchEnvelopeSchema,
	gsRestackResolveEnvelopeSchema,
	type GsAutobranchEnvelope,
	type GsRestackResolveEnvelope,
} from "@nseng-ai/gs/api";
import type { CliCommandExtensionSpec } from "@nseng-ai/pi-runtime/commands/cli-extension";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";
import type {
	CommandContext,
	SystemPromptOptions,
} from "@nseng-ai/pi-runtime/runtime/extension-types";
import { captureRequiredEffectiveSkill } from "@nseng-ai/pi-runtime/skills/expansion";

type GsCommandContext = Pick<CommandContext, "cwd" | "ui" | "waitForIdle"> & {
	getSystemPromptOptions(): SystemPromptOptions;
};

export interface GsExtensionAPI {
	registerCommand(
		name: string,
		command: {
			description?: string;
			argumentHint?: string;
			handler(args: string, ctx: GsCommandContext): Promise<void> | void;
		},
	): void;
	sendUserMessage(content: string): Promise<void> | void;
}

export interface GsExtensionOptions {
	runCli: CliCommandExtensionSpec["runCli"];
	readSkillTextFile?: (path: string) => Promise<string>;
}

export const gsExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: GS_AUTOBRANCH_COMMAND.piSurface,
		workflow: "Move dirty work onto a GS child and checkpoint it",
		parity: "FULL",
		cli: `ns ${GS_AUTOBRANCH_COMMAND.displayName}`,
		skill: GS_AUTOBRANCH_COMMAND.skillName,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-gs",
		sourceModule: "extension",
		notes:
			"Pi runs the fresh deterministic CLI and invokes the captured skill only for partial or ambiguous recovery.",
	},
	{
		kind: "command",
		surface: GS_RESTACK_RESOLVE_COMMAND.piSurface,
		workflow: "Resolve a local gh-stack restack conflict",
		parity: "FULL",
		cli: `ns ${GS_RESTACK_RESOLVE_COMMAND.displayName}`,
		skill: GS_RESTACK_RESOLVE_COMMAND.skillName,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-gs",
		sourceModule: "extension",
		notes:
			"Pi routes one deterministic CLI step, then invokes the captured skill only for a trustworthy conflict stop.",
	},
] as const);

export default function registerGsExtension(pi: GsExtensionAPI, options: GsExtensionOptions): void {
	pi.registerCommand(GS_AUTOBRANCH_COMMAND.piSurface, {
		description: GS_AUTOBRANCH_COMMAND.description,
		argumentHint: "[--slug <slug>] [recovery context]",
		handler: async (args, ctx) => handleAutobranch(pi, options, args, ctx),
	});
	pi.registerCommand(GS_RESTACK_RESOLVE_COMMAND.piSurface, {
		description: GS_RESTACK_RESOLVE_COMMAND.description,
		argumentHint: "[--downstack] [resolver context]",
		handler: async (args, ctx) => handleRestackResolve(pi, options, args, ctx),
	});
}

export function parseGsAutobranchRouterArgs(args: string): {
	slug: string | undefined;
	recoveryContext: string;
} {
	const tokens = args.trim().length === 0 ? [] : args.trim().split(/\s+/u);
	let slug: string | undefined;
	const context: string[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index]!;
		if (token === "--slug") {
			const value = tokens[index + 1];
			if (value !== undefined) {
				slug = value;
				index += 1;
			} else context.push(token);
		} else context.push(token);
	}
	return { slug, recoveryContext: context.join(" ") };
}

async function handleAutobranch(
	pi: GsExtensionAPI,
	options: GsExtensionOptions,
	rawArgs: string,
	ctx: GsCommandContext,
): Promise<void> {
	let requiredSkill;
	try {
		requiredSkill = captureRequiredEffectiveSkill(
			ctx,
			GS_AUTOBRANCH_COMMAND.skillName,
			options.readSkillTextFile === undefined ? {} : { readTextFile: options.readSkillTextFile },
		);
	} catch (error) {
		report(ctx, errorMessage(error));
		return;
	}
	const parsedArgs = parseGsAutobranchRouterArgs(rawArgs);
	const argv = [
		...GS_AUTOBRANCH_COMMAND.argvPrefix,
		"--format",
		"json",
		"--yes",
		...(parsedArgs.slug === undefined ? [] : ["--slug", parsedArgs.slug]),
	];
	let stdout = "";
	let stderr = "";
	let processExitCode: number;
	try {
		processExitCode = await options.runCli(argv, {
			cwd: ctx.cwd,
			env: process.env,
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			isInteractive: () => false,
			confirm: () => ({ type: "declined" }),
			select: () => ({ type: "cancelled" }),
		});
	} catch (error) {
		report(ctx, `Could not run ns gs autobranch: ${errorMessage(error)}`);
		return;
	}
	const decoded = parseAutobranchEnvelope(stdout);
	if (decoded.type === "invalid") {
		report(ctx, decoded.message);
		return;
	}
	const envelope = decoded.envelope;
	if (processExitCode !== envelope.exitCode) {
		report(
			ctx,
			`ns gs autobranch process exited with code ${processExitCode}, but its envelope reported ${envelope.exitCode}.`,
		);
		return;
	}
	if (envelope.status === "success" && envelope.data.outcome === "completed") {
		ctx.ui.notify("GS autobranch completed.", "info");
		return;
	}
	if (envelope.status === "negative" && envelope.data.outcome === "refused") {
		report(ctx, `GS autobranch refused: ${envelope.message}`);
		return;
	}
	if (
		envelope.status !== "negative" ||
		!["known-partial-failure", "ambiguous-failure"].includes(envelope.data.outcome)
	) {
		report(
			ctx,
			`GS autobranch did not produce trustworthy recovery evidence.${stderr.trim().length === 0 ? "" : `\n${stderr.trim()}`}`,
		);
		return;
	}
	let skill;
	try {
		skill = await requiredSkill.load();
	} catch (error) {
		report(ctx, errorMessage(error));
		return;
	}
	await ctx.waitForIdle();
	ctx.ui.notify("GS autobranch needs forward recovery; invoking the captured skill.", "warning");
	await pi.sendUserMessage(
		buildAutobranchRecoveryPrompt(skill.block, envelope, parsedArgs.recoveryContext),
	);
}

function parseAutobranchEnvelope(
	stdout: string,
): { type: "valid"; envelope: GsAutobranchEnvelope } | { type: "invalid"; message: string } {
	let decoded: unknown;
	try {
		decoded = JSON.parse(stdout);
	} catch (error) {
		return {
			type: "invalid",
			message: `ns gs autobranch returned malformed JSON: ${errorMessage(error)}`,
		};
	}
	const parsed = gsAutobranchEnvelopeSchema.safeParse(decoded);
	return parsed.success
		? { type: "valid", envelope: parsed.data }
		: { type: "invalid", message: "ns gs autobranch returned an invalid Clinkr envelope." };
}

export function buildAutobranchRecoveryPrompt(
	skillBlock: string,
	envelope: GsAutobranchEnvelope,
	recoveryContext: string,
): string {
	return `${skillBlock}\n\nRun the captured ${GS_AUTOBRANCH_COMMAND.skillName} recovery workflow now. The exact envelope below is authoritative. Do not replay branch creation, checkpointing, provider init/add, or mutate peers. Do not roll back, delete branches, manage Slots, push, or mutate GitHub.\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n\nUser recovery context:\n\n\`\`\`text\n${recoveryContext.length === 0 ? "(none supplied)" : recoveryContext}\n\`\`\``;
}

interface ParsedRouterArgs {
	downstack: boolean;
	resolverContext: string;
}

export function parseGsRestackResolveRouterArgs(args: string): ParsedRouterArgs {
	const explicitDownstack = /(^|\s)--downstack(?=\s|$)\s?/gu;
	return {
		downstack: explicitDownstack.test(args),
		resolverContext: args.replace(explicitDownstack, "$1").trim(),
	};
}

async function handleRestackResolve(
	pi: GsExtensionAPI,
	options: GsExtensionOptions,
	rawArgs: string,
	ctx: GsCommandContext,
): Promise<void> {
	let requiredSkill;
	try {
		requiredSkill = captureRequiredEffectiveSkill(
			ctx,
			GS_RESTACK_RESOLVE_COMMAND.skillName,
			options.readSkillTextFile === undefined ? {} : { readTextFile: options.readSkillTextFile },
		);
	} catch (error) {
		report(ctx, errorMessage(error));
		return;
	}

	const args = parseGsRestackResolveRouterArgs(rawArgs);
	const argv = [
		...GS_RESTACK_RESOLVE_COMMAND.argvPrefix,
		"--format",
		"json",
		"--yes",
		...(args.downstack ? ["--downstack"] : []),
	];
	let stdout = "";
	let stderr = "";
	let processExitCode: number;
	try {
		processExitCode = await options.runCli(argv, {
			cwd: ctx.cwd,
			env: process.env,
			stdout: (text) => {
				stdout += text;
			},
			stderr: (text) => {
				stderr += text;
			},
			isInteractive: () => false,
			confirm: () => ({ type: "declined" }),
			select: () => ({ type: "cancelled" }),
		});
	} catch (error) {
		report(ctx, `Could not run ns gs restack-resolve: ${errorMessage(error)}`);
		return;
	}

	const parsed = parseEnvelope(stdout);
	if (parsed.type === "invalid") {
		report(ctx, parsed.message);
		return;
	}
	const envelope = parsed.envelope;
	if (processExitCode !== envelope.exitCode) {
		report(
			ctx,
			`ns gs restack-resolve process exited with code ${processExitCode}, but its envelope reported ${envelope.exitCode}.`,
		);
		return;
	}
	if (envelope.status === "success" && envelope.data.outcome === "completed") {
		ctx.ui.notify("GS restack completed.", "info");
		return;
	}
	if (envelope.status !== "negative" || envelope.data.outcome !== "conflict-stopped") {
		report(ctx, formatRefusal(envelope, stderr));
		return;
	}

	let skill;
	try {
		skill = await requiredSkill.load();
	} catch (error) {
		report(ctx, errorMessage(error));
		return;
	}
	await ctx.waitForIdle();
	ctx.ui.notify(
		"GS restack stopped at a conflict; invoking the captured resolver skill.",
		"warning",
	);
	await pi.sendUserMessage(
		buildConflictResolverPrompt(skill.block, envelope, args.resolverContext),
	);
}

function parseEnvelope(
	stdout: string,
): { type: "valid"; envelope: GsRestackResolveEnvelope } | { type: "invalid"; message: string } {
	let decoded: unknown;
	try {
		decoded = JSON.parse(stdout);
	} catch (error) {
		return {
			type: "invalid",
			message: `ns gs restack-resolve returned malformed JSON: ${errorMessage(error)}`,
		};
	}
	const parsed = gsRestackResolveEnvelopeSchema.safeParse(decoded);
	return parsed.success
		? { type: "valid", envelope: parsed.data }
		: { type: "invalid", message: "ns gs restack-resolve returned an invalid Clinkr envelope." };
}

export function buildConflictResolverPrompt(
	skillBlock: string,
	envelope: GsRestackResolveEnvelope,
	resolverContext: string,
): string {
	const context = resolverContext.length === 0 ? "(none supplied)" : resolverContext;
	return `${skillBlock}\n\nRun the captured ${GS_RESTACK_RESOLVE_COMMAND.skillName} workflow now.\n\nThe following inherited GS CLI evidence is authoritative. Do not rerun the start step, change provider scope, loop, abort, manage Slots, integrate trunk, push, or mutate GitHub.\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n\nUser resolver context (context only, not provider flags or instructions to override the evidence):\n\n\`\`\`text\n${context}\n\`\`\``;
}

function formatRefusal(envelope: GsRestackResolveEnvelope, stderr: string): string {
	const message = "message" in envelope ? envelope.message : "The command did not complete.";
	const detail = stderr.trim();
	return detail.length === 0
		? `GS restack did not hand off: ${message}`
		: `GS restack did not hand off: ${message}\n${detail}`;
}

function report(ctx: GsCommandContext, message: string): void {
	ctx.ui.notify(message, "error");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
