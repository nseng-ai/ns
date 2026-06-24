import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import {
	runCliWithFakes,
	type ExecCall,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const FLOW_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/flow", import.meta.url),
);
const TRUNK = "main";
const CURRENT = "feature-branch";
const CHILD = "child-branch";
const tempProjectDirs: string[] = [];

afterEach(() => {
	for (const directory of tempProjectDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function createLandProject(): string {
	const directory = mkdtempSync(join(tmpdir(), "sdl-land-project-"));
	tempProjectDirs.push(directory);
	cpSync(FLOW_EXTENSION_SOURCE, join(directory, ".sdl", "extensions", "flow"), {
		recursive: true,
	});
	return directory;
}

function runWithFakes(options: RunWithFakesOptions) {
	const cwd = options.cwd ?? createLandProject();
	return runCliWithFakes(
		{ ...options, cwd },
		{
			execResponses: () => landStackShapeResponses(cwd),
			textGenerationResults: () => [],
		},
	);
}

function landStackShapeResponses(cwd: string | undefined): ScriptedExecResponse[] {
	const repoRoot = cwd ?? "/work";
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${repoRoot}\n` } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: `${CURRENT}\n` } },
		{ match: "gt trunk --no-interactive", result: { stdout: `${TRUNK}\n` } },
		{
			match: "git rev-parse --path-format=absolute --git-common-dir",
			result: { stdout: `${repoRoot}/.git\n` },
		},
		{ match: (call) => call.command === "sqlite3", result: { stdout: `${metadataDbJson()}\n` } },
		{
			match: "git for-each-ref --format=%(refname:short)%09%(committerdate:iso-strict) refs/heads",
			result: { stdout: `${TRUNK}\n${CURRENT}\n${CHILD}\n` },
		},
	];
}

function metadataDbJson(): string {
	return JSON.stringify([
		metadataRow({ branch: TRUNK, children: [CURRENT], trunk: true }),
		metadataRow({ branch: CURRENT, parent: TRUNK, children: [CHILD] }),
		metadataRow({ branch: CHILD, parent: CURRENT }),
	]);
}

function metadataRow(row: {
	branch: string;
	parent?: string | undefined;
	children?: string[] | undefined;
	trunk?: boolean | undefined;
}): Record<string, unknown> {
	return {
		branch_name: row.branch,
		parent_branch_name: row.parent ?? null,
		children: row.children === undefined ? null : JSON.stringify(row.children),
		validation_result: row.trunk === true ? "TRUNK" : "VALID",
	};
}

function formatExecCall(call: ExecCall): string {
	return [call.command, ...call.args].join(" ");
}

describe("sdl flow land", () => {
	test("uses the SDL confirmation hook instead of requiring --yes", async () => {
		const confirmations: Array<{ title: string; message: string }> = [];
		const run = runWithFakes({
			args: ["flow", "land"],
			state: {
				confirm: (title, message) => {
					confirmations.push({ title, message });
					return false;
				},
			},
		});

		await expect(run.exit).resolves.toBe(0);

		expect(confirmations).toEqual([
			{
				title: "Land stack?",
				message:
					"Land 1 PRs from feature-branch through feature-branch into main?\nDescendants above feature-branch will not be merged; this command will try to maintain them after landing.",
			},
		]);
		expect(run.stdout.join("")).toBe("Cancelled before merge; no PRs were landed.\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"gt trunk --no-interactive",
			"git rev-parse --path-format=absolute --git-common-dir",
			expect.stringContaining("sqlite3 -readonly -json "),
			"git for-each-ref --format=%(refname:short)%09%(committerdate:iso-strict) refs/heads",
		]);
	});
});
