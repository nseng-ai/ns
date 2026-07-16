import { describe, expect, test } from "vitest";

import type { DispatchPromptOutcome } from "../../src/dispatch-client/outcome.ts";
import {
	FAKE_HEAD_SHA,
	FAKE_RUN_ID,
	FAKE_WORKFLOW_RUN_URL,
} from "../dispatch-client/support/dispatch-prompt-fakes.ts";
import {
	DISPATCHED_OUTCOME,
	EXPECTED_ANCHOR_BRANCH,
	PROMPT,
	runPromptCommand,
} from "./dispatch-prompt-command-support.ts";

const GRAPHITE_SOURCE = {
	type: "graphite-submitted" as const,
	mutation: { local: "none" as const, remote: "observed" as const },
	affectedBranches: ["feature/widgets", "feature/base"],
};

describe("ns dispatch prompt", () => {
	test.each([
		["already-current", "already current on origin"],
		["git-pushed", "exact-SHA Git push"],
		["graphite-submitted", "through Graphite"],
	] as const)("renders representative %s success", async (method, humanText) => {
		const source =
			method === "already-current"
				? { type: method }
				: method === "git-pushed"
					? { type: method, mutation: { local: "none" as const, remote: "observed" as const } }
					: GRAPHITE_SOURCE;
		const outcome = {
			...DISPATCHED_OUTCOME,
			receipt: { ...DISPATCHED_OUTCOME.receipt, source },
		} satisfies DispatchPromptOutcome;
		const { exit } = await runPromptCommand([PROMPT], outcome);

		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		expect(exit.data).toEqual({
			status: "dispatched",
			revision: FAKE_HEAD_SHA,
			sourceBranch: "feature/widgets",
			sourcePublication: method,
			anchorBranch: EXPECTED_ANCHOR_BRANCH,
			anchorPrNumber: 41,
			anchorPrUrl: "https://github.com/nseng-ai/ns/pull/41",
			runId: FAKE_RUN_ID,
			workflowRunUrl: FAKE_WORKFLOW_RUN_URL,
		});
		expect(exit.human).toContain(humanText);
	});

	test.each([
		["--slug", "custom-widget", false],
		["-s", "custom-widget", false],
		["--force", undefined, true],
		["-f", undefined, true],
	] as const)("maps %s into the core request", async (flag, slugOverride, force) => {
		const argv = slugOverride === undefined ? [flag, PROMPT] : [flag, slugOverride, PROMPT];
		const { requests } = await runPromptCommand(argv);

		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({ prompt: PROMPT, force });
		if (slugOverride === undefined) expect(requests[0]).not.toHaveProperty("slugOverride");
		else expect(requests[0]).toHaveProperty("slugOverride", slugOverride);
	});

	test("maps interactive decline to a bounded negative result", async () => {
		const affectedBranches = Array.from({ length: 60 }, (_, index) => `feature/${index}`);
		const { exit } = await runPromptCommand([PROMPT], {
			status: "source-publication-declined",
			affectedBranches,
		});

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") return;
		expect(exit.data).toEqual({
			status: "source-publication-declined",
			affectedBranches: affectedBranches.slice(0, 50),
			totalAffectedBranches: 60,
		});
	});

	test("maps a representative pre-mutation failure", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			status: "preflight-failed",
			checks: [{ id: "dispatch-config", status: "failed", detail: "deployment_url missing" }],
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("preflight-failed");
		expect(exit.message).toContain("deployment_url missing");
	});

	test("maps publication failure evidence and scope", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			status: "graphite-publication-failed",
			stage: "submit",
			code: "submit-failed",
			message: "Graphite publication failed.",
			receipt: {
				stage: "source",
				source: {
					type: "graphite-publication-attempted",
					mutation: { local: "none", remote: "possible" },
					affectedBranches: ["feature/widgets", "feature/base"],
				},
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.errorType).toBe("graphite-publication-failed");
		expect(exit.data).toMatchObject({
			stage: "submit",
			code: "submit-failed",
			mutation: { local: "none", remote: "possible" },
			totalAffectedBranches: 2,
		});
		expect(exit.message).toContain("No dispatch anchor or run was created");
	});

	test("maps post-publication verification failure with bounded dirty paths", async () => {
		const dirtyPaths = Array.from({ length: 101 }, (_, index) => `path-${index}.ts`);
		const { exit } = await runPromptCommand([PROMPT], {
			status: "source-publication-verification-failed",
			reason: "dirty-tree",
			message: "The worktree changed.",
			receipt: { stage: "source", source: GRAPHITE_SOURCE },
			dirtyPaths,
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.data).toMatchObject({
			reason: "dirty-tree",
			sourcePublication: "graphite-submitted",
			dirtyPaths: dirtyPaths.slice(0, 100),
			totalDirtyPaths: 101,
			anchorCreated: false,
			runStarted: false,
		});
	});

	test("maps a post-anchor trigger failure", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			status: "trigger-failed",
			code: "workflow-start-failed",
			message: "Trigger failed.",
			receipt: {
				stage: "pr-opened",
				source: GRAPHITE_SOURCE,
				anchorPr: DISPATCHED_OUTCOME.receipt.anchorPr,
			},
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.data).toMatchObject({
			anchorBranch: EXPECTED_ANCHOR_BRANCH,
			anchorPrNumber: 41,
			anchorCreated: true,
			runStarted: false,
		});
		expect(exit.message).toContain("is open but no run was started");
	});

	test("maps a post-run stamp failure", async () => {
		const { exit } = await runPromptCommand([PROMPT], {
			status: "run-id-stamp-failed",
			message: "Stamp failed.",
			receipt: { ...DISPATCHED_OUTCOME.receipt, source: GRAPHITE_SOURCE },
		});

		expect(exit.type).toBe("failure");
		if (exit.type !== "failure") return;
		expect(exit.data).toMatchObject({ runId: FAKE_RUN_ID, anchorCreated: true, runStarted: true });
		expect(exit.message).toContain(FAKE_RUN_ID);
	});

	test("bounds dirty-tree human and machine output", async () => {
		const dirtyPaths = Array.from({ length: 101 }, (_, index) => `path-${index}.ts`);
		const { exit } = await runPromptCommand([PROMPT], { status: "dirty-tree", dirtyPaths });

		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") return;
		expect(exit.message).toContain("… and 81 more");
		expect(exit.data).toEqual({
			status: "dirty-tree",
			dirtyPaths: dirtyPaths.slice(0, 100),
			totalDirtyPaths: 101,
		});
	});

	test.each([{ argv: ["   "] }, { argv: [] }] as const)(
		"rejects blank or missing prompt %#",
		async ({ argv }) => {
			const { exit, requests } = await runPromptCommand(argv);
			expect(exit.type).toBe("usageError");
			expect(requests).toEqual([]);
		},
	);

	test.each(["--help", "-h"])("%s renders command usage", async (flag) => {
		const { exit } = await runPromptCommand([flag]);
		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		const help = String(exit.data);
		expect(help).toContain("Usage: ns dispatch prompt");
		expect(help).toContain("--slug");
		expect(help).toContain("--force");
		expect(help).toContain("never bypasses Graphite safeguards");
	});

	test("--json-schema keeps sourcePublication and retires isSourcePushed", async () => {
		const { exit } = await runPromptCommand(["--json-schema"]);
		expect(exit.type).toBe("ok");
		if (exit.type !== "ok") return;
		const schema = JSON.stringify(exit.data);
		expect(schema).toContain("sourcePublication");
		expect(schema).toContain("already-current");
		expect(schema).toContain("git-pushed");
		expect(schema).toContain("graphite-submitted");
		expect(schema).not.toContain("isSourcePushed");
	});
});
