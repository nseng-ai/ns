import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

const JUST_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_CHARS = 24_000;
const SKILL_NAME = "dev-just-fix";

type NotifyLevel = "info" | "warning" | "error";

type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

type CommandInfo = {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		baseDir?: string;
	};
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
	getCommands(): CommandInfo[];
	sendUserMessage(content: string): void;
};

function stripFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

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

async function expandSkill(pi: ExtensionAPI): Promise<{ name: string; block: string } | undefined> {
	const command = pi
		.getCommands()
		.find((candidate) => candidate.source === "skill" && candidate.name === `skill:${SKILL_NAME}`);
	if (!command) {
		return undefined;
	}

	const skillPath = command.sourceInfo.path;
	const baseDir = command.sourceInfo.baseDir ?? dirname(skillPath);
	const body = stripFrontmatter(await readFile(skillPath, "utf8"));
	return {
		name: SKILL_NAME,
		block: `<skill name="${SKILL_NAME}" location="${skillPath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`,
	};
}

function buildFailurePrompt(skillBlock: string | undefined, result: ExecResult, cwd: string): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const justOutput = formatJustOutput(result);
	const fallback =
		"The dev-just-fix skill was not found among loaded Pi skills. Follow the repository's dev-just-fix workflow anyway.";

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

	const skill = await expandSkill(pi);
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill ? `\`just\` failed; invoking ${skill.name}.` : "`just` failed; dev-just-fix was not found.",
			skill ? "warning" : "error",
		);
	}

	pi.sendUserMessage(buildFailurePrompt(skill?.block, result, ctx.cwd));
}

export default function justFixExtension(pi: ExtensionAPI): void {
	pi.registerCommand("just", {
		description: "Run `just`; if it fails, invoke dev-just-fix.",
		handler: async (_args, ctx) => runJustThenInvokeSkill(pi, ctx),
	});
}
