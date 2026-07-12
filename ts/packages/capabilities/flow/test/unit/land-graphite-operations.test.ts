import { describe, expect, test } from "vitest";
import type { ExecResult } from "@nseng-ai/foundation/command";

import {
	LAND_BACKUP_RECOVERY_HINT,
	buildGraphiteOperationArgs,
	formatGraphiteOperation,
	parseGitCheckedOutElsewhere,
	stripAnsi,
	type LandGraphiteOperation,
} from "../../src/land/graphite-operations.ts";

function exitedResult(stderr: string): ExecResult {
	return { type: "exited", stdout: "", stderr, code: 1, signal: null };
}

describe("land Graphite operations", () => {
	test("formats every operation without changing argument order", () => {
		const cases: readonly [LandGraphiteOperation, readonly string[], string][] = [
			[{ kind: "trunk" }, ["trunk", "--no-interactive"], "gt trunk --no-interactive"],
			[
				{ kind: "submit-update", branch: "feature/a", shouldForce: true },
				[
					"submit",
					"--branch",
					"feature/a",
					"--no-stack",
					"--update-only",
					"--no-edit",
					"--no-ai",
					"--no-interactive",
					"--force",
				],
				"gt submit --branch feature/a --no-stack --update-only --no-edit --no-ai --no-interactive --force",
			],
			[
				{ kind: "restack", branch: "feature a", scope: "upstack" },
				["restack", "--branch", "feature a", "--upstack", "--no-interactive"],
				"gt restack --branch 'feature a' --upstack --no-interactive",
			],
			[
				{ kind: "get-downstack-no-checkout", branch: "feature/a" },
				[
					"get",
					"feature/a",
					"--downstack",
					"--no-restack",
					"--no-checkout",
					"--force",
					"--no-interactive",
				],
				"gt get feature/a --downstack --no-restack --no-checkout --force --no-interactive",
			],
			[
				{ kind: "delete-local-branch", branch: "feature/a" },
				["delete", "feature/a", "-f", "-q"],
				"gt delete feature/a -f -q",
			],
			[
				{ kind: "untrack-local-branch", branch: "feature/a" },
				["untrack", "feature/a"],
				"gt untrack feature/a",
			],
		];

		for (const [operation, args, display] of cases) {
			expect(buildGraphiteOperationArgs(operation)).toEqual(args);
			expect(formatGraphiteOperation(operation)).toBe(display);
		}
	});

	test("parses checked-out-elsewhere output after stripping terminal escapes", () => {
		const result = exitedResult(
			"\u001b[31mfatal: 'feature/a' is already checked out at '/repo/worktree'\u001b[0m\n",
		);
		expect(parseGitCheckedOutElsewhere(result)).toEqual({
			branch: "feature/a",
			path: "/repo/worktree",
		});
		expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
	});

	test("retains the backup recovery text", () => {
		expect(LAND_BACKUP_RECOVERY_HINT).toBe(
			"Pre-land branch SHAs are saved under refs/ns/flow-land-backup/<branch>; one previous generation is kept under refs/ns/flow-land-backup-prev/<branch> (restore with git update-ref refs/heads/<branch> refs/ns/flow-land-backup/<branch>).",
		);
	});
});
