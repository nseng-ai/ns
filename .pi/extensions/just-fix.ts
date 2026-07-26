import { importTypeScriptWorkspaceModule } from "../lib/workspace-packages.ts";

const { runCommand } = await importTypeScriptWorkspaceModule<
	typeof import("@nseng-ai/foundation/exec")
>("@nseng-ai/foundation/exec");
const { sendCommandProgressOrNotify, registerCommandWithImmediateAck } =
	await importTypeScriptWorkspaceModule<typeof import("@nseng-ai/pi-runtime/commands/ack")>(
		"@nseng-ai/pi-runtime/commands/ack",
	);
const { LiveCommandProgress } = await importTypeScriptWorkspaceModule<
	typeof import("@nseng-ai/pi-runtime/commands/cli-command-live-progress")
>("@nseng-ai/pi-runtime/commands/cli-command-live-progress");
const { expandRepoSkillBlock } = await importTypeScriptWorkspaceModule<
	typeof import("@nseng-ai/pi-runtime/skills/expansion")
>("@nseng-ai/pi-runtime/skills/expansion");

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
		setWidget?(
			key: string,
			value: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void;
	};
	waitForIdle(): Promise<void>;
};

type ExecOptions = {
	cwd?: string;
	timeout?: number;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
};

type ExecCommand = (
	command: string,
	args: readonly string[],
	options?: ExecOptions,
) => Promise<ExecResult>;

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
	skillBlock: string,
	result: ExecResult,
	cwd: string,
	displayCommand: JustCommand["displayCommand"],
): string {
	const status = result.killed
		? `exit code ${result.code}; process was killed or timed out`
		: `exit code ${result.code}`;
	const justOutput = formatJustOutput(result);

	return `${skillBlock}

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
	exec: ExecCommand,
): Promise<void> {
	await ctx.waitForIdle();

	let skill: Awaited<ReturnType<typeof expandRepoSkillBlock>>;
	try {
		skill = await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: SKILL_NAME });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		const error = new Error(`Could not load required skill "${SKILL_NAME}": ${message}`, { cause });
		if (ctx.hasUI) {
			ctx.ui.notify(error.message, "error");
		}
		return;
	}

	sendCommandProgressOrNotify({ host: pi, ctx, message: `Running \`${command.displayCommand}\`…` });

	const progress = new LiveCommandProgress(ctx, {
		argv: command.recipeArgs,
		cliName: "just",
		commandName: command.displayCommand,
		piCommandName: command.name,
	});
	progress.setPhase("running");
	let result: ExecResult;
	try {
		result = await exec("just", command.recipeArgs, {
			cwd: ctx.cwd,
			timeout: command.timeoutMs,
			onStdout: (text) => progress.appendOutput("stdout", text),
			onStderr: (text) => progress.appendOutput("stderr", text),
		});
	} finally {
		progress.close();
	}

	if (result.code === 0 && !result.killed) {
		if (ctx.hasUI) {
			ctx.ui.notify(`\`${command.displayCommand}\` passed.`, "info");
		}
		return;
	}

	if (ctx.hasUI) {
		ctx.ui.notify(`\`${command.displayCommand}\` failed; invoking ${skill.name}.`, "warning");
	}

	pi.sendUserMessage(buildFailurePrompt(skill.block, result, ctx.cwd, command.displayCommand));
}

export default function justFixExtension(pi: ExtensionAPI, exec: ExecCommand = runCommand): void {
	for (const command of JUST_COMMANDS) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: command.name,
			commandDefinition: {
				description: command.description,
				handler: async (_args, ctx) => runJustThenInvokeSkill(pi, ctx, command, exec),
			},
		});
	}
}
