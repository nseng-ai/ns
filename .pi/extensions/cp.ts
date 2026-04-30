import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const COMMAND_NAME = "cp";
const MODEL = "claude-haiku-4-5";
const SYSTEM_PROMPT = `You write terse checkpoint commit messages for coding agents.

Given git status and diff, output exactly one git commit message:
- Subject line first, prefixed with "[cp]".
- Subject must be at most 60 characters total, imperative mood, no trailing period.
- Then one blank line.
- Then 1 to 3 bullet lines, each starting with "- ".
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- No Co-Authored-By trailer.
- Mention untracked files by filename when they matter.
- Optimize for later agents scanning git log, not for a polished PR description.`;

type CommandResult = {
	code: number;
	stdout: string;
	stderr: string;
};

type CommitMessage = {
	subject: string;
	bullets: string[];
};

export default function checkpointExtension(pi: ExtensionAPI) {
	pi.registerCommand(COMMAND_NAME, {
		description: "Create a Haiku-written checkpoint commit for the current diff",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const preflight = await checkPreflight(pi, ctx.cwd);
			if ("error" in preflight) {
				ctx.ui.notify(preflight.error, "error");
				return;
			}

			ctx.ui.notify("Drafting checkpoint commit message with Haiku…", "info");

			const draft = await draftCommitMessage(pi, ctx.cwd, preflight.status, preflight.diff);
			if ("error" in draft) {
				ctx.ui.notify(draft.error, "error");
				return;
			}

			const committed = await createCommit(pi, ctx.cwd, draft.message);
			if ("error" in committed) {
				ctx.ui.notify(committed.error, "error");
				return;
			}

			ctx.ui.notify(`${committed.summary}\n${draft.message}`, "success");
		},
	});
}

async function checkPreflight(
	pi: ExtensionAPI,
	cwd: string,
): Promise<{ branch: string; status: string; diff: string } | { error: string }> {
	const branch = await exec(pi, "git", ["symbolic-ref", "--short", "HEAD"], cwd, 5_000);
	if (branch.code !== 0) {
		return { error: formatCommandError("Could not determine current branch.", branch) };
	}

	const branchName = branch.stdout.trim();
	if (branchName === "main" || branchName === "master") {
		return { error: `Refusing to create checkpoint commit on trunk branch: ${branchName}` };
	}

	const status = await exec(pi, "git", ["status", "--porcelain"], cwd, 5_000);
	if (status.code !== 0) {
		return { error: formatCommandError("Could not inspect git status.", status) };
	}
	if (status.stdout.trim().length === 0) {
		return { error: "Working tree is clean; nothing to checkpoint." };
	}

	const diff = await exec(pi, "git", ["diff", "HEAD"], cwd, 30_000);
	if (diff.code !== 0) {
		return { error: formatCommandError("Could not capture git diff.", diff) };
	}

	return { branch: branchName, status: status.stdout, diff: diff.stdout };
}

async function draftCommitMessage(
	pi: ExtensionAPI,
	cwd: string,
	status: string,
	diff: string,
): Promise<{ message: string } | { error: string }> {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-cp-"));
	try {
		const systemPromptPath = join(tempDir, "system-prompt.txt");
		const userPromptPath = join(tempDir, "user-prompt.txt");
		await writeFile(systemPromptPath, SYSTEM_PROMPT, "utf8");
		await writeFile(userPromptPath, buildUserPrompt(status, diff), "utf8");

		const result = await exec(
			pi,
			"bash",
			[
				"-lc",
				'env -u CLAUDECODE claude -p --model "$1" --output-format text --system-prompt "$(cat \"$2\")" < "$3"',
				"bash",
				MODEL,
				systemPromptPath,
				userPromptPath,
			],
			cwd,
			120_000,
		);
		if (result.code !== 0) {
			return { error: formatCommandError("Claude failed to draft a checkpoint message.", result) };
		}

		const parsed = parseCommitMessage(result.stdout);
		if (!parsed) {
			return {
				error: `Claude returned an invalid checkpoint message:\n${result.stdout.trim()}`,
			};
		}

		return { message: formatCommitMessage(parsed) };
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

async function createCommit(
	pi: ExtensionAPI,
	cwd: string,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	const tempDir = await mkdtemp(join(tmpdir(), "pi-cp-commit-"));
	try {
		const messagePath = join(tempDir, "message.txt");
		await writeFile(messagePath, `${message}\n`, "utf8");

		const add = await exec(pi, "git", ["add", "-A"], cwd, 30_000);
		if (add.code !== 0) {
			return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
		}

		const commit = await exec(pi, "git", ["commit", "-F", messagePath], cwd, 120_000);
		if (commit.code !== 0) {
			return { error: formatCommandError("Checkpoint commit failed.", commit) };
		}

		const log = await exec(pi, "git", ["log", "-1", "--oneline"], cwd, 5_000);
		if (log.code !== 0) {
			return { error: formatCommandError("Created checkpoint commit, but failed to read it back.", log) };
		}

		return { summary: log.stdout.trim() };
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

function buildUserPrompt(status: string, diff: string): string {
	return `Draft a checkpoint commit message for this pending git state.\n\n## git status --porcelain\n\n${status.trim() || "(clean)"}\n\n## git diff HEAD\n\n${diff.trim() || "(no tracked diff; rely on untracked filenames in status)"}\n`;
}

function parseCommitMessage(output: string): CommitMessage | undefined {
	const cleaned = stripCodeFence(output.trim());
	const lines = cleaned
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line, index, all) => !(line.length === 0 && (index === 0 || index === all.length - 1)));

	if (lines.length < 3 || lines[1] !== "") {
		return undefined;
	}

	const subject = normalizeSubject(lines[0] ?? "");
	if (!subject || subject.length > 60) {
		return undefined;
	}

	const bullets = lines.slice(2).filter((line) => line.length > 0);
	if (bullets.length < 1 || bullets.length > 3 || bullets.some((line) => !line.startsWith("- "))) {
		return undefined;
	}

	return { subject, bullets };
}

function normalizeSubject(subject: string): string | undefined {
	const withPrefix = subject.startsWith("[cp]") ? subject : `[cp] ${subject}`;
	const withoutTrailingPeriod = withPrefix.endsWith(".") ? withPrefix.slice(0, -1) : withPrefix;
	return withoutTrailingPeriod.length > 0 ? withoutTrailingPeriod : undefined;
}

function formatCommitMessage(message: CommitMessage): string {
	return [message.subject, "", ...message.bullets].join("\n");
}

function stripCodeFence(text: string): string {
	if (!text.startsWith("```")) {
		return text;
	}
	return text
		.replace(/^```[a-zA-Z0-9_-]*\n?/, "")
		.replace(/\n?```$/, "")
		.trim();
}

async function exec(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	cwd: string,
	timeout: number,
): Promise<CommandResult> {
	return pi.exec(command, args, { cwd, timeout });
}

function formatCommandError(summary: string, result: CommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	return [summary, details].filter(Boolean).join("\n");
}
