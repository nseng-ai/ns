import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const COMMAND_NAME = "land";
const REQUIRED_BASE_BRANCH = "master";

type PullRequestView = {
	number?: number;
	headRefName?: string;
	baseRefName?: string;
};

export default function landExtension(pi: ExtensionAPI) {
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

			ctx.ui.notify("Running gh pr merge -s…", "info");

			const result = await pi.exec("gh", ["pr", "merge", "-s"], {
				cwd: ctx.cwd,
				timeout: 120_000,
			});

			const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
			if (result.code === 0) {
				ctx.ui.notify(output || "Merged PR with gh pr merge -s.", "success");
				return;
			}

			ctx.ui.notify(output || `gh pr merge -s failed with exit code ${result.code}.`, "error");
		},
	});
}

async function loadPullRequest(pi: ExtensionAPI, cwd: string): Promise<PullRequestView | { error: string }> {
	const result = await pi.exec("gh", ["pr", "view", "--json", "number,headRefName,baseRefName"], {
		cwd,
		timeout: 30_000,
	});
	if (result.code !== 0) {
		const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
		return { error: output || `gh pr view failed with exit code ${result.code}. Merge not attempted.` };
	}

	try {
		const pr = JSON.parse(result.stdout) as PullRequestView;
		if (!pr.number || !pr.headRefName || !pr.baseRefName) {
			return { error: "gh pr view did not return PR number/head/base fields. Merge not attempted." };
		}
		return pr;
	} catch (error) {
		return { error: `Failed to parse gh pr view output: ${errorMessage(error)}. Merge not attempted.` };
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
