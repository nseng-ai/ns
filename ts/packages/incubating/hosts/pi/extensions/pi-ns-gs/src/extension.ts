import process from "node:process";

import {
	GS_RESTACK_RESOLVE_COMMAND,
	gsRestackResolveEnvelopeSchema,
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
	pi.registerCommand(GS_RESTACK_RESOLVE_COMMAND.piSurface, {
		description: GS_RESTACK_RESOLVE_COMMAND.description,
		argumentHint: "[--downstack] [resolver context]",
		handler: async (args, ctx) => handleRestackResolve(pi, options, args, ctx),
	});
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
