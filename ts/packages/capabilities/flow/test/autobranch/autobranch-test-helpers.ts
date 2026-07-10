import type { ExecResult } from "@nseng-ai/foundation/command";
import {
	createAutobranchGitGateway,
	type AutobranchGitGateway,
} from "../../src/autobranch/git-gateway.ts";
import type {
	CommandResult,
	PendingWorktreeSnapshot,
} from "../../src/autobranch/dirty-worktree.ts";

export type { CommandResult, PendingWorktreeSnapshot };

export type UpstreamMode = "contains" | "ahead" | "none" | "failed";

export function ok(stdout = "", stderr = ""): CommandResult & ExecResult {
	return { type: "exited", code: 0, signal: null, stdout, stderr };
}

export function fail(stderr: string, code = 1): CommandResult & ExecResult {
	return { type: "exited", code, signal: null, stdout: "", stderr };
}

export function eventIndex(events: readonly string[], prefix: string): number {
	return events.findIndex((event) => event.startsWith(prefix));
}

export function createFakeBranchAvailability(
	exec: (command: string, args: string[]) => Promise<CommandResult>,
): { isBranchNameAvailable(branchName: string): Promise<boolean> } {
	return {
		async isBranchNameAvailable(branchName) {
			const valid = await exec("git", ["check-ref-format", "--branch", branchName]);
			if (!(valid.type === "exited" && valid.signal === null && valid.code === 0)) return false;

			const refsToCheck = [branchHeadRef(branchName), ...branchParentHeadRefs(branchName)];
			for (const ref of refsToCheck) {
				const exists = await exec("git", ["show-ref", "--verify", "--quiet", ref]);
				if (!(exists.type === "exited" && exists.signal === null && exists.code === 1))
					return false;
			}

			const childRefs = await exec("git", [
				"for-each-ref",
				"--format=%(refname)",
				`${branchHeadRef(branchName)}/`,
			]);
			return (
				childRefs.type === "exited" &&
				childRefs.signal === null &&
				childRefs.code === 0 &&
				childRefs.stdout.trim().length === 0
			);
		},
	};
}

function branchHeadRef(branchName: string): string {
	return `refs/heads/${branchName}`;
}

function branchParentHeadRefs(branchName: string): string[] {
	const segments = branchName.split("/");
	const refs: string[] = [];
	for (let index = 1; index < segments.length; index += 1) {
		refs.push(branchHeadRef(segments.slice(0, index).join("/")));
	}
	return refs;
}

export function createTestAutobranchGitGateway(
	cwd: string,
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>,
): AutobranchGitGateway {
	return createAutobranchGitGateway({ cwd, exec });
}
