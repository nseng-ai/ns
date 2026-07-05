import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { optionalEntry } from "@nseng-ai/core/primitives";

export { InMemoryGitGateway, normalizeGitTestingRelativePath } from "./git-testing.ts";
export type {
	GitBranchCall,
	GitCall,
	GitPathCall,
	GitRefsPathCall,
	GitRevisionRangePathCall,
	InMemoryGitGatewayState,
} from "./git-testing.ts";

export interface TempGitRepo {
	readonly path: string;
	runGit(args: readonly string[], options?: TempGitRepoRunOptions): string;
	cleanup(): void;
}

export interface TempGitRepoOptions {
	readonly prefix?: string;
	readonly userEmail?: string;
	readonly userName?: string;
	readonly readmeText?: string;
	readonly initialCommitMessage?: string;
}

export interface TempGitRepoRunOptions {
	readonly input?: string;
	readonly env?: NodeJS.ProcessEnv;
}

export function createTempGitRepo(options: TempGitRepoOptions = {}): TempGitRepo {
	const path = mkdtempSync(join(tmpdir(), options.prefix ?? "ns-git-test-"));
	const runGit = (args: readonly string[], runOptions: TempGitRepoRunOptions = {}): string => {
		const result = spawnSync("git", [...args], {
			cwd: path,
			...optionalEntry("input", runOptions.input),
			encoding: "utf8",
			...optionalEntry("env", runOptions.env),
		});
		if (result.status !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
		}
		return result.stdout;
	};

	runGit(["init", "-b", "main"]);
	runGit(["config", "user.email", options.userEmail ?? "ns-test@example.com"]);
	runGit(["config", "user.name", options.userName ?? "ns Test"]);
	writeFileSync(join(path, "README.md"), options.readmeText ?? "test repo\n", "utf8");
	runGit(["add", "README.md"]);
	runGit(["commit", "-m", options.initialCommitMessage ?? "initial"]);

	return {
		path,
		runGit,
		cleanup() {
			rmSync(path, { recursive: true, force: true });
		},
	};
}
