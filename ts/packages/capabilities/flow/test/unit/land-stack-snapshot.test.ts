import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@sdl/exec";
import { ScriptedQueue } from "@sdl/test-kit";
import { type LandStackResult } from "../../src/land-stack/errors.ts";
import { loadStackSnapshot } from "../../src/land-stack/stack-facts.ts";
import type { LandStackExtensionAPI, StackSnapshot } from "../../src/land-stack/types.ts";
import { metadataDbJson, TOPOLOGY_COMMAND, topologyArgs } from "./land-test-helpers.ts";

const ROOT = "/repo";

const TRUNK = "main";

const CURRENT = "feature-b";

const GIT_COMMON_DIR = `${ROOT}/.git`;

const DB_PATH = `${GIT_COMMON_DIR}/.graphite_metadata.db`;

const TOPOLOGY_ARGS = topologyArgs(DB_PATH);

type MessageRenderer = Parameters<NonNullable<LandStackExtensionAPI["registerMessageRenderer"]>>[1];

type SentMessage = Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0] & {
	options?: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[1];
};

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

class FakePi implements LandStackExtensionAPI {
	readonly execCalls: ExecCall[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly messages: SentMessage[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[] = []) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}

	sendMessage(
		message: Parameters<NonNullable<LandStackExtensionAPI["sendMessage"]>>[0],
		options?: SentMessage["options"],
	): void {
		this.messages.push({ ...message, options });
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${formatCommand(command, args)}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${formatCommand(expected.command, expected.args)}, got ${formatCommand(command, args)}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}

		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
		...(overrides.startupError === undefined ? {} : { startupError: overrides.startupError }),
	};
}

function expectSuccess<T>(result: LandStackResult<T>): T {
	expect(result.type).toBe("success");
	if (result.type !== "success") {
		throw new Error(`Expected land-stack success, got failure: ${result.failure.message}`);
	}
	return result.value;
}

function expectFailure<T>(result: LandStackResult<T>) {
	expect(result.type).toBe("failure");
	if (result.type !== "failure") {
		throw new Error("Expected land-stack failure, got success.");
	}
	return result.failure;
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

describe("loadStackSnapshot reconciles Graphite metadata against live local refs", () => {
	const FOR_EACH_REF_ARGS = [
		"for-each-ref",
		"--format=%(refname:short)%09%(committerdate:iso-strict)",
		"refs/heads",
	];

	async function loadSnapshot(
		dbRows: string,
		liveBranches: string[],
		current = CURRENT,
	): Promise<LandStackResult<StackSnapshot>> {
		const pi = new FakePi([
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
			step("git", FOR_EACH_REF_ARGS, {
				stdout: liveBranches.length > 0 ? `${liveBranches.join("\n")}\n` : "",
			}),
		]);
		const result = await loadStackSnapshot({
			pi,
			repoRoot: ROOT,
			metadataDbPath: DB_PATH,
			current,
			trunk: TRUNK,
		});
		pi.assertDone();
		return result;
	}

	test("ignores a dangling descendant child and warns instead of aborting", async () => {
		const dbRows = metadataDbJson([
			{ branch: TRUNK, children: ["feature-a"], trunk: true },
			{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
			{ branch: "feature-b", parent: "feature-a", children: ["phantom;touch-owned"] },
		]);

		const snapshot = expectSuccess(await loadSnapshot(dbRows, [TRUNK, "feature-a", "feature-b"]));

		expect(snapshot.landingBranches).toEqual(["feature-a", "feature-b"]);
		expect(snapshot.descendantBranches).toEqual([]);
		expect(
			snapshot.warnings.some(
				(warning) =>
					warning.includes("phantom;touch-owned") &&
					warning.includes("gt untrack 'phantom;touch-owned'"),
			),
		).toBe(true);
	});

	test("does not fire the fork gate on a phantom sibling", async () => {
		const dbRows = metadataDbJson([
			{ branch: TRUNK, children: ["feature-a"], trunk: true },
			{ branch: "feature-a", parent: TRUNK, children: ["feature-b", "phantom"] },
			{ branch: "feature-b", parent: "feature-a", children: [] },
		]);

		const snapshot = expectSuccess(await loadSnapshot(dbRows, [TRUNK, "feature-a", "feature-b"]));

		expect(snapshot.landingBranches).toEqual(["feature-a", "feature-b"]);
		expect(snapshot.warnings.some((warning) => warning.includes("phantom"))).toBe(true);
	});

	test("still fires the fork gate on two live siblings", async () => {
		const dbRows = metadataDbJson([
			{ branch: TRUNK, children: ["feature-a"], trunk: true },
			{ branch: "feature-a", parent: TRUNK, children: ["feature-b", "side"] },
			{ branch: "feature-b", parent: "feature-a", children: [] },
			{ branch: "side", parent: "feature-a", children: [] },
		]);

		const failure = expectFailure(
			await loadSnapshot(dbRows, [TRUNK, "feature-a", "feature-b", "side"]),
		);
		expect(failure.message).toContain("forks at feature-a");
	});

	test("still fails when a real ancestor row has no live ref", async () => {
		const dbRows = metadataDbJson([
			{ branch: TRUNK, children: ["feature-a"], trunk: true },
			{ branch: "feature-a", parent: TRUNK, children: ["feature-b"] },
			{ branch: "feature-b", parent: "feature-a", children: [] },
		]);

		// feature-a is a genuine ancestor; dropping its ref leaves a broken stack, not stale state.
		const failure = expectFailure(await loadSnapshot(dbRows, [TRUNK, "feature-b"]));
		expect(failure.message).toContain("feature-a");
	});

	test("aborts when live-branch enumeration fails rather than dropping real branches", async () => {
		const dbRows = metadataDbJson([
			{ branch: TRUNK, children: ["feature-b"], trunk: true },
			{ branch: "feature-b", parent: TRUNK, children: [] },
		]);
		const pi = new FakePi([
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, { stdout: `${dbRows}\n` }),
			step("git", FOR_EACH_REF_ARGS, { code: 128, stderr: "boom" }),
		]);

		const result = await loadStackSnapshot({
			pi,
			repoRoot: ROOT,
			metadataDbPath: DB_PATH,
			current: "feature-b",
			trunk: TRUNK,
		});
		pi.assertDone();
		expect(expectFailure(result).message).toContain("Could not enumerate local branches");
	});
});
