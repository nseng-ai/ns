import { createFlowBranchLatestCommitCommand } from "../../../../commands/branch-latest-commit.ts";

export async function command() {
	return createFlowBranchLatestCommitCommand("gh-stack");
}
