import {
	sendCommandProgressOrNotify,
	registerCommandWithImmediateAck,
} from "../../ts/packages/hosts/pi/src/commands/ack.ts";
import { expandRepoSkillBlock } from "../../ts/packages/hosts/pi/src/kit/skills/expansion.ts";

const JUST_TIMEOUT_MS = 10 * 60 * 1000;
const JUST_CI_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_CHARS = 24_000;
const SKILL_NAME = "code-just-fix";

type NotifyLevel = "info" | "warning" | "error";

type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

type JustCommand = {
	name: "just" | "just-ci";
	recipeArgs: string[];
	displayCommand: "just" | "just ci";
	description: string;
	timeoutMs: number;
};

const JUST_COMMANDS: readonly JustCommand[] = [
	{
		name: "just",
		recipeArgs: [],
		displayCommand: "just",
		description: "Run `just`; if it fails, invoke code-just-fix.",
		timeoutMs: JUST_TIMEOUT_MS,
	},
	{
		name: "just-ci",
		recipeArgs: ["ci"],
		displayCommand: "just ci",
		description: "Run CI excluding docs-site and Reviews; if it fails, invoke code-just-fix.",
		timeoutMs: JUST_CI_TIMEOUT_MS,
	},
];

type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	sendUserMessage(content: string): void;
};

function truncateTail(text: string, maxChars: number): { text: string; truncated: boolean } {
	if (text.length <= maxChars) {
		return { text, truncated: false };
	}

	return {
		text: text.slice(text.length - maxChars),
		truncated: true,
	};
}

function formatJustOutput(result: ExecResult): string {
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	const combined = [`stdout:\n${stdout}`, `stderr:\n${stderr}`].join("\n\n");
	const { text, truncated } = truncateTail(combined, MAX_OUTPUT_CHARS);

	if (!truncated) {
		return text;
	}

	return `[Output truncated to the last ${MAX_OUTPUT_CHARS} characters.]\n\n${text}`;
}

function buildFailurePrompt(
	skillBlock: string | undefined,
	result: ExecResult,
	cwd: string,
	displayCommand: JustCommand["displayCommand"],
): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const justOutput = formatJustOutput(result);
	const fallback =
		"The code-just-fix skill was not found among loaded Pi skills. Follow the repository's code-just-fix workflow anyway.";

	return `${skillBlock ?? fallback}

\`${displayCommand}\` has already been run in ${cwd} and failed (${status}).

Use the initial failure output below for orientation, then follow the skill workflow. Re-run \`${displayCommand}\` yourself as needed and fix the root cause.

\`\`\`text
${justOutput}
\`\`\``;
}

async function runJustThenInvokeSkill(
	pi: ExtensionAPI,
	ctx: CommandContext,
	command: JustCommand,
): Promise<void> {
	sendCommandProgressOrNotify({ host: pi, ctx, message: `Running \`${command.displayCommand}\`…` });
	await ctx.waitForIdle();

	ctx.ui.setStatus(command.name, `running ${command.displayCommand}…`);
	let result: ExecResult;
	try {
		result = await pi.exec("just", command.recipeArgs, { cwd: ctx.cwd, timeout: command.timeoutMs });
	} finally {
		ctx.ui.setStatus(command.name, undefined);
	}

	if (result.code === 0 && !result.killed) {
		if (ctx.hasUI) {
			ctx.ui.notify(`\`${command.displayCommand}\` passed.`, "info");
		}
		return;
	}

	let skill: Awaited<ReturnType<typeof expandRepoSkillBlock>> | undefined;
	try {
		skill = await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: SKILL_NAME });
	} catch {
		// Missing skill is handled below by sending the repository workflow fallback prompt.
		skill = undefined;
	}
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill
				? `\`${command.displayCommand}\` failed; invoking ${skill.name}.`
				: `\`${command.displayCommand}\` failed; code-just-fix was not found.`,
			skill ? "warning" : "error",
		);
	}

	pi.sendUserMessage(buildFailurePrompt(skill?.block, result, ctx.cwd, command.displayCommand));
}

export default function justFixExtension(pi: ExtensionAPI): void {
	for (const command of JUST_COMMANDS) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: command.name,
			commandDefinition: {
				description: command.description,
				handler: async (_args, ctx) => runJustThenInvokeSkill(pi, ctx, command),
			},
		});
	}
}
