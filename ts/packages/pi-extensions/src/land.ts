export type NotifyLevel = "info" | "success" | "warning" | "error";

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export interface PrintOutput {
	write(chunk: string): unknown;
}

export interface ExtensionCommandContext {
	cwd: string;
	mode?: ExtensionMode;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
	printOutput?: PrintOutput;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
}

const COMMAND_NAME = "code:land";
const REQUIRED_BASE_BRANCH = "master";
const PR_VIEW_FIELDS = "number,headRefName,baseRefName,title,body,headRefOid";
const PR_VIEW_TIMEOUT_MS = 30_000;
const PR_MERGE_TIMEOUT_MS = 120_000;

export interface ValidPullRequestView {
	number: number;
	headRefName: string;
	baseRefName: string;
	title: string;
	body: string;
	headRefOid: string;
}

export default function landExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Squash-merge the current branch's GitHub PR into master",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const pr = await loadPullRequest(pi, ctx.cwd);
			if ("error" in pr) {
				notify(ctx, pr.error, "error");
				return;
			}

			if (pr.baseRefName !== REQUIRED_BASE_BRANCH) {
				notify(
					ctx,
					`Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not '${REQUIRED_BASE_BRANCH}'. Merge not attempted.`,
					"error",
				);
				return;
			}

			notify(ctx, "Running gh pr merge -s with PR title/body as commit message…", "info");

			const result = await pi.exec(
				"gh",
				[
					"pr",
					"merge",
					String(pr.number),
					"-s",
					"--match-head-commit",
					pr.headRefOid,
					"--subject",
					pr.title,
					"--body",
					pr.body,
				],
				{
					cwd: ctx.cwd,
					timeout: PR_MERGE_TIMEOUT_MS,
				},
			);

			const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
			if (result.code === 0) {
				const message = `Merged PR #${pr.number}; squash commit used PR title/body.`;
				notify(ctx, output ? `${output}\n${message}` : message, "info");
				return;
			}

			const message = `gh pr merge -s with PR title/body failed for PR #${pr.number} with exit code ${result.code}.`;
			notify(ctx, output ? `${output}\n${message}` : message, "error");
		},
	});
}

function notify(ctx: ExtensionCommandContext, message: string, level: NotifyLevel): void {
	if (ctx.mode === "print") {
		const output = message.endsWith("\n") ? message : `${message}\n`;
		(ctx.printOutput ?? process.stdout).write(output);
	}
	ctx.ui.notify(message, level);
}

export async function loadPullRequest(pi: Pick<ExtensionAPI, "exec">, cwd: string): Promise<ValidPullRequestView | { error: string }> {
	const result = await pi.exec("gh", ["pr", "view", "--json", PR_VIEW_FIELDS], {
		cwd,
		timeout: PR_VIEW_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
		return { error: output || `gh pr view failed with exit code ${result.code}. Merge not attempted.` };
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return { error: `Failed to parse gh pr view output: ${errorMessage(error)}. Merge not attempted.` };
	}

	return parsePullRequestView(raw);
}

export function parsePullRequestView(value: unknown): ValidPullRequestView | { error: string } {
	if (!isRecord(value)) {
		return { error: "gh pr view did not return a PR object. Merge not attempted." };
	}

	const number = typeof value.number === "number" && Number.isFinite(value.number) ? value.number : undefined;
	const headRefName = nonEmptyString(value.headRefName) ? value.headRefName : undefined;
	const baseRefName = nonEmptyString(value.baseRefName) ? value.baseRefName : undefined;
	const title = nonEmptyString(value.title) ? value.title : undefined;
	const headRefOid = nonEmptyString(value.headRefOid) ? value.headRefOid : undefined;

	const missingFields: string[] = [];
	if (number === undefined) missingFields.push("number");
	if (headRefName === undefined) missingFields.push("headRefName");
	if (baseRefName === undefined) missingFields.push("baseRefName");
	if (title === undefined) missingFields.push("title");
	if (headRefOid === undefined) missingFields.push("headRefOid");

	if (
		number === undefined ||
		headRefName === undefined ||
		baseRefName === undefined ||
		title === undefined ||
		headRefOid === undefined
	) {
		return { error: `gh pr view did not return required field(s): ${missingFields.join(", ")}. Merge not attempted.` };
	}

	const body = value.body;
	if (body !== undefined && body !== null && typeof body !== "string") {
		return { error: "gh pr view returned a non-string body. Merge not attempted." };
	}

	return { number, headRefName, baseRefName, title, body: typeof body === "string" ? body : "", headRefOid };
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
