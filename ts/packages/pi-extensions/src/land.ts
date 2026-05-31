export type NotifyLevel = "info" | "success" | "warning" | "error";

export type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
};

export type ExtensionCommandContext = {
	cwd: string;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description: string;
			handler(args: string, ctx: ExtensionCommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
};

const COMMAND_NAME = "gh:land";
const REQUIRED_BASE_BRANCH = "master";
const PR_VIEW_FIELDS = "number,headRefName,baseRefName,title,body,headRefOid";
const PR_VIEW_TIMEOUT_MS = 30_000;
const PR_MERGE_TIMEOUT_MS = 120_000;

type PullRequestView = {
	number?: number;
	headRefName?: string;
	baseRefName?: string;
	title?: string;
	body?: string | null;
	headRefOid?: string;
};

export type ValidPullRequestView = {
	number: number;
	headRefName: string;
	baseRefName: string;
	title: string;
	body: string;
	headRefOid: string;
};

export default function landExtension(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Squash-merge the current branch's GitHub PR into master",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			const pr = await loadPullRequest(pi, ctx.cwd);
			if ("error" in pr) {
				ctx.ui.notify(pr.error, "error");
				return;
			}

			if (pr.baseRefName !== REQUIRED_BASE_BRANCH) {
				ctx.ui.notify(
					`Refusing to land PR #${pr.number}: base branch is '${pr.baseRefName}', not '${REQUIRED_BASE_BRANCH}'. Merge not attempted.`,
					"error",
				);
				return;
			}

			ctx.ui.notify("Running gh pr merge -s with PR title/body as commit message…", "info");

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
				ctx.ui.notify(output ? `${output}\n${message}` : message, "info");
				return;
			}

			const message = `gh pr merge -s with PR title/body failed for PR #${pr.number} with exit code ${result.code}.`;
			ctx.ui.notify(output ? `${output}\n${message}` : message, "error");
		},
	});
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

	try {
		const pr = parsePullRequestView(JSON.parse(result.stdout) as PullRequestView);
		if ("error" in pr) {
			return pr;
		}
		return pr;
	} catch (error) {
		return { error: `Failed to parse gh pr view output: ${errorMessage(error)}. Merge not attempted.` };
	}
}

export function parsePullRequestView(pr: PullRequestView): ValidPullRequestView | { error: string } {
	const number = typeof pr.number === "number" ? pr.number : undefined;
	const headRefName = nonEmptyString(pr.headRefName) ? pr.headRefName : undefined;
	const baseRefName = nonEmptyString(pr.baseRefName) ? pr.baseRefName : undefined;
	const title = nonEmptyString(pr.title) ? pr.title : undefined;
	const headRefOid = nonEmptyString(pr.headRefOid) ? pr.headRefOid : undefined;
	const body = typeof pr.body === "string" ? pr.body : "";

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

	return { number, headRefName, baseRefName, title, body, headRefOid };
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
