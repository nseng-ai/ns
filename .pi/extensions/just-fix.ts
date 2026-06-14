import { expandRepoSkillBlock } from "../../ts/packages/pi-extensions/src/skill-expansion.ts";

const JUST_TIMEOUT_MS = 10 * 60 * 1000;
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

function buildFailurePrompt(skillBlock: string | undefined, result: ExecResult, cwd: string): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const justOutput = formatJustOutput(result);
	const fallback =
		"The code-just-fix skill was not found among loaded Pi skills. Follow the repository's code-just-fix workflow anyway.";

	return `${skillBlock ?? fallback}

\`just\` has already been run in ${cwd} and failed (${status}).

Use the initial failure output below for orientation, then follow the skill workflow. Re-run \`just\` yourself as needed and fix the root cause.

\`\`\`text
${justOutput}
\`\`\``;
}

async function runJustThenInvokeSkill(pi: ExtensionAPI, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	if (ctx.hasUI) {
		ctx.ui.setStatus("just", "running just…");
		ctx.ui.notify("Running `just`…", "info");
	}

	let result: ExecResult;
	try {
		result = await pi.exec("just", [], { cwd: ctx.cwd, timeout: JUST_TIMEOUT_MS });
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus("just", undefined);
		}
	}

	if (result.code === 0 && !result.killed) {
		if (ctx.hasUI) {
			ctx.ui.notify("`just` passed.", "info");
		}
		return;
	}

	let skill: Awaited<ReturnType<typeof expandRepoSkillBlock>> | undefined;
	try {
		skill = await expandRepoSkillBlock({ cwd: ctx.cwd, skillName: SKILL_NAME });
	} catch {
		// Skill expansion is best-effort; the fallback prompt below still gives the agent the just failure.
		skill = undefined;
	}
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill ? `\`just\` failed; invoking ${skill.name}.` : "`just` failed; code-just-fix was not found.",
			skill ? "warning" : "error",
		);
	}

	pi.sendUserMessage(buildFailurePrompt(skill?.block, result, ctx.cwd));
}

export default function justFixExtension(pi: ExtensionAPI): void {
	pi.registerCommand("just", {
		description: "Run `just`; if it fails, invoke code-just-fix.",
		handler: async (_args, ctx) => runJustThenInvokeSkill(pi, ctx),
	});
}
