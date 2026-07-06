import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import { type LandStackResult } from "../../src/land/stack/errors.ts";
import { PR_FIELDS } from "../../src/land/stack/constants.ts";
import { loadPr } from "../../src/land/stack/pr-facts.ts";
import type { LandStackExtensionAPI } from "../../src/land/stack/types.ts";

const ROOT = "/repo";

const TRUNK = "main";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

describe("loadPr boundary parsing", () => {
	function prViewStep(result: Partial<ExecResult>): ScriptedExec {
		return step("gh", ["pr", "view", "feature-a", "--json", PR_FIELDS], result);
	}

	test("returns a normalized snapshot for valid PR JSON", async () => {
		const pi = new FakePi([
			prViewStep({
				stdout: JSON.stringify({
					id: "PR_node_101",
					number: 101,
					title: "Ship it",
					body: null,
					state: "OPEN",
					isDraft: false,
					headRefName: "feature-a",
					baseRefName: TRUNK,
					headRefOid: SHA_A,
					mergeStateStatus: "CLEAN",
					url: "https://github.example/pull/101",
					mergedAt: null,
					unexpected: "ignored",
				}),
			}),
		]);

		const pr = expectSuccess(await loadPr(pi, ROOT, "feature-a"));

		pi.assertDone();
		expect(pr).toEqual({
			id: "PR_node_101",
			number: 101,
			title: "Ship it",
			body: null,
			state: "OPEN",
			isDraft: false,
			headRefName: "feature-a",
			baseRefName: TRUNK,
			headRefOid: SHA_A,
			mergeStateStatus: "CLEAN",
			url: "https://github.example/pull/101",
			mergedAt: null,
		});
	});

	test("drops malformed optional fields instead of trusting them", async () => {
		const pi = new FakePi([
			prViewStep({
				stdout: JSON.stringify({
					id: "PR_node_101",
					number: 101,
					title: "Ship it",
					body: "Body",
					state: "OPEN",
					isDraft: true,
					headRefName: "feature-a",
					baseRefName: TRUNK,
					headRefOid: SHA_A,
					mergeStateStatus: 5,
					url: { not: "a string" },
					mergedAt: 12345,
				}),
			}),
		]);

		const pr = expectSuccess(await loadPr(pi, ROOT, "feature-a"));

		pi.assertDone();
		expect(pr.isDraft).toBe(true);
		expect(pr.mergeStateStatus).toBeUndefined();
		expect(pr.url).toBeUndefined();
		expect(pr.mergedAt).toBeUndefined();
	});

	test("rejects a non-object top-level PR JSON", async () => {
		const pi = new FakePi([prViewStep({ stdout: "[]" })]);

		const failure = expectFailure(await loadPr(pi, ROOT, "feature-a"));

		pi.assertDone();
		expect(failure.message).toContain("did not return required PR fields");
	});

	test("rejects a non-boolean isDraft rather than coercing it", async () => {
		const pi = new FakePi([
			prViewStep({
				stdout: JSON.stringify({
					id: "PR_node_101",
					number: 101,
					title: "Ship it",
					body: "Body",
					state: "OPEN",
					isDraft: "false",
					headRefName: "feature-a",
					baseRefName: TRUNK,
					headRefOid: SHA_A,
				}),
			}),
		]);

		expect(expectFailure(await loadPr(pi, ROOT, "feature-a")).message).toContain(
			"did not return required PR fields",
		);
	});

	test("rejects a snapshot missing the PR node id", async () => {
		const pi = new FakePi([
			prViewStep({
				stdout: JSON.stringify({
					number: 101,
					title: "Ship it",
					body: "Body",
					state: "OPEN",
					isDraft: false,
					headRefName: "feature-a",
					baseRefName: TRUNK,
					headRefOid: SHA_A,
				}),
			}),
		]);

		expect(expectFailure(await loadPr(pi, ROOT, "feature-a")).message).toContain(
			"did not return required PR fields",
		);
	});

	test("fails clearly on invalid PR JSON", async () => {
		const pi = new FakePi([prViewStep({ stdout: "not json" })]);

		expect(expectFailure(await loadPr(pi, ROOT, "feature-a")).message).toContain(
			"Failed to parse gh pr view output for feature-a",
		);
	});
});
