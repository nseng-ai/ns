import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface TempGitRepo {
	path: string;
	runGit: (args: readonly string[], options?: { input?: string | undefined }) => string;
	cleanup: () => void;
}

export function createTempGitRepo(): TempGitRepo {
	const path = mkdtempSync(join(tmpdir(), "brmem-ts-test-"));
	const runGit = (args: readonly string[], options: { input?: string | undefined } = {}) => {
		const result = spawnSync("git", [...args], { cwd: path, input: options.input, encoding: "utf8" });
		if (result.status !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
		}
		return result.stdout;
	};
	runGit(["init", "-b", "main"]);
	runGit(["config", "user.email", "brmem-test@example.com"]);
	runGit(["config", "user.name", "brmem Test"]);
	writeFileSync(join(path, "README.md"), "test repo\n", "utf8");
	runGit(["add", "README.md"]);
	runGit(["commit", "-m", "initial"]);
	return {
		path,
		runGit,
		cleanup: () => rmSync(path, { recursive: true, force: true }),
	};
}
