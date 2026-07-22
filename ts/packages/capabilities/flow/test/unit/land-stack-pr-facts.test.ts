import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@nseng-ai/foundation/command";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import { type LandResult } from "../../src/land/results.ts";
import { PR_FIELDS } from "../../src/land/stack/constants.ts";
import {
	GH_REPO_VIEW_NAME_WITH_OWNER_ARGS,
	batchedPullRequestFactsGraphqlArgs,
	loadPr,
	loadPrsByBranch,
} from "../../src/land/stack/pr-facts.ts";
import type { LandStackExtensionAPI } from "../../src/land/stack/types.ts";

const ROOT = "/repo";

const TRUNK = "main";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const BRANCHES = ["feature-a", "feature-b", "feature-c"] as const;

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
	result: ExitedResultFields | undefined;
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

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

function execResult(overrides: ExitedResultFields = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}

function expectSuccess<T>(result: LandResult<T>): T {
	expect(result.type).toBe("success");
	if (result.type !== "success") {
		throw new Error(`Expected land-stack success, got failure: ${result.failure.message}`);
	}
	return result.value;
}

function expectFailure<T>(result: LandResult<T>) {
	expect(result.type).toBe("failure");
	if (result.type !== "failure") {
		throw new Error("Expected land-stack failure, got success.");
	}
	return result.failure;
}

function step(command: string, args: string[], result?: ExitedResultFields): ScriptedExec {
	return { command, args, result };
}

function prFacts(options: {
	branch: string;
	number: number;
	state: "OPEN" | "MERGED" | "CLOSED";
	sha: string;
}) {
	return {
		id: `PR_node_${options.number}`,
		number: options.number,
		title: `PR ${options.number}`,
		body: null,
		state: options.state,
		isDraft: false,
		headRefName: options.branch,
		baseRefName: TRUNK,
		headRefOid: options.sha,
		mergeStateStatus: "CLEAN",
		url: `https://github.example/pull/${options.number}`,
		mergedAt: options.state === "MERGED" ? "2026-07-01T00:00:00Z" : null,
	};
}

function batchedSteps(repository: Record<string, unknown>): ScriptedExec[] {
	return [
		step("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS, {
			stdout: JSON.stringify({ nameWithOwner: "owner/repo" }),
		}),
		step("gh", batchedPullRequestFactsGraphqlArgs({ owner: "owner", name: "repo" }, BRANCHES), {
			stdout: JSON.stringify({ data: { repository } }),
		}),
	];
}

describe("loadPrsByBranch batched boundary parsing", () => {
	test.each(["MERGED", "CLOSED"] as const)("loads a valid %s PR candidate", async (state) => {
		const first = prFacts({ branch: BRANCHES[0], number: 101, state, sha: SHA_A });
		const pi = new FakePi(
			batchedSteps({
				b0: { nodes: [first] },
				b1: {
					nodes: [prFacts({ branch: BRANCHES[1], number: 102, state: "OPEN", sha: SHA_B })],
				},
				b2: {
					nodes: [prFacts({ branch: BRANCHES[2], number: 103, state: "OPEN", sha: SHA_C })],
				},
			}),
		);

		const prs = expectSuccess(await loadPrsByBranch(pi, ROOT, BRANCHES));

		pi.assertDone();
		expect(prs.get(BRANCHES[0])).toMatchObject({ number: 101, state });
	});

	test("prefers the unique open PR over newer historical candidates", async () => {
		const pi = new FakePi(
			batchedSteps({
				b0: {
					nodes: [
						prFacts({ branch: BRANCHES[0], number: 111, state: "CLOSED", sha: SHA_A }),
						prFacts({ branch: BRANCHES[0], number: 101, state: "OPEN", sha: SHA_A }),
					],
				},
				b1: {
					nodes: [prFacts({ branch: BRANCHES[1], number: 102, state: "OPEN", sha: SHA_B })],
				},
				b2: {
					nodes: [prFacts({ branch: BRANCHES[2], number: 103, state: "OPEN", sha: SHA_C })],
				},
			}),
		);

		const prs = expectSuccess(await loadPrsByBranch(pi, ROOT, BRANCHES));

		expect(prs.get(BRANCHES[0])).toMatchObject({ number: 101, state: "OPEN" });
	});

	test("reports an absent PR", async () => {
		const pi = new FakePi(
			batchedSteps({ b0: { nodes: [] }, b1: { nodes: [] }, b2: { nodes: [] } }),
		);

		expect(expectFailure(await loadPrsByBranch(pi, ROOT, BRANCHES)).message).toContain(
			"No GitHub pull request is associated with branch feature-a",
		);
	});

	test("reports a malformed top-level envelope", async () => {
		const pi = new FakePi([
			step("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS, {
				stdout: JSON.stringify({ nameWithOwner: "owner/repo" }),
			}),
			step("gh", batchedPullRequestFactsGraphqlArgs({ owner: "owner", name: "repo" }, BRANCHES), {
				stdout: JSON.stringify({ data: null }),
			}),
		]);

		const message = expectFailure(await loadPrsByBranch(pi, ROOT, BRANCHES)).message;
		expect(message).toContain("malformed top-level envelope");
		expect(message).not.toContain("unexpected shape");
	});

	test("reports the branch with a malformed PR connection", async () => {
		const pi = new FakePi(
			batchedSteps({
				b0: {
					nodes: [prFacts({ branch: BRANCHES[0], number: 101, state: "OPEN", sha: SHA_A })],
				},
				b1: { nodes: "invalid" },
				b2: { nodes: [] },
			}),
		);

		const message = expectFailure(await loadPrsByBranch(pi, ROOT, BRANCHES)).message;
		expect(message).toContain("malformed PR connection");
		expect(message).toContain("feature-b");
	});

	test("reports the branch with malformed PR candidate data", async () => {
		const pi = new FakePi(
			batchedSteps({
				b0: {
					nodes: [prFacts({ branch: BRANCHES[0], number: 101, state: "OPEN", sha: SHA_A })],
				},
				b1: { nodes: [{ number: 102 }] },
				b2: { nodes: [] },
			}),
		);

		const message = expectFailure(await loadPrsByBranch(pi, ROOT, BRANCHES)).message;
		expect(message).toContain("malformed PR candidate data");
		expect(message).toContain("feature-b");
	});

	test("rejects multiple open candidates as ambiguous", async () => {
		const open = prFacts({ branch: BRANCHES[0], number: 101, state: "OPEN", sha: SHA_A });
		const pi = new FakePi(
			batchedSteps({
				b0: { nodes: [open, { ...open, id: "PR_node_111", number: 111 }] },
				b1: { nodes: [prFacts({ branch: BRANCHES[1], number: 102, state: "OPEN", sha: SHA_B })] },
				b2: { nodes: [prFacts({ branch: BRANCHES[2], number: 103, state: "OPEN", sha: SHA_C })] },
			}),
		);

		const message = expectFailure(await loadPrsByBranch(pi, ROOT, BRANCHES)).message;
		expect(message).toContain("feature-a");
		expect(message).toContain("#101");
		expect(message).toContain("#111");
		expect(message).toContain("cannot choose safely");
		expect(message).not.toContain("unexpected shape");
	});
});

describe("loadPr boundary parsing", () => {
	function prViewStep(result: ExitedResultFields): ScriptedExec {
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
