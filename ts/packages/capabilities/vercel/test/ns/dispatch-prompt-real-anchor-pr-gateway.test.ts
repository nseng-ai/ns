import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

import { buildDispatchRunIdStamp } from "../../src/dispatch/run-id-stamp.ts";
import {
	createRealDispatchAnchorPrGateway,
	parseGhPrCreateUrl,
} from "../../src/ns/dispatch-prompt/real-anchor-pr-gateway.ts";

function exited(overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {}): ExecResult {
	return { type: "exited", stdout: "", stderr: "", code: 0, signal: null, ...overrides };
}

function scriptedRunner(responses: readonly ExecResult[]) {
	const calls: { command: string; args: readonly string[] }[] = [];
	let index = 0;
	const runner: CommandRunner = async (command, args) => {
		calls.push({ command, args: [...args] });
		const response = responses[index] ?? responses[responses.length - 1];
		index += 1;
		return response ?? exited();
	};
	return { runner, calls };
}

describe("anchor PR wire parser", () => {
	test("parses the PR url printed by gh pr create", () => {
		expect(parseGhPrCreateUrl("Some notice\nhttps://github.com/nseng-ai/ns/pull/612\n")).toEqual({
			number: 612,
			url: "https://github.com/nseng-ai/ns/pull/612",
		});
		expect(parseGhPrCreateUrl("no url here")).toBeNull();
	});
});

describe("real anchor PR gateway", () => {
	test("opens the anchor PR through gh and parses the PR url", async () => {
		const { runner, calls } = scriptedRunner([
			exited({ stdout: "https://github.com/nseng-ai/ns/pull/612\n" }),
		]);
		const gateway = createRealDispatchAnchorPrGateway(runner);
		const result = await gateway.openAnchorPr({
			cwd: "/repo",
			anchorBranch: "dispatch/feature-ab12cd34",
			baseBranch: "feature",
			title: "[dispatch] Do a thing",
			body: "Body",
		});

		expect(result).toEqual({
			ok: true,
			value: { number: 612, url: "https://github.com/nseng-ai/ns/pull/612" },
		});
		expect(calls[0]?.command).toBe("gh");
		expect(calls[0]?.args).toEqual([
			"pr",
			"create",
			"--head",
			"dispatch/feature-ab12cd34",
			"--base",
			"feature",
			"--title",
			"[dispatch] Do a thing",
			"--body",
			"Body",
		]);
	});

	test("stamps the run id by composing the existing PR body", async () => {
		const { runner, calls } = scriptedRunner([
			exited({ stdout: JSON.stringify({ body: "Existing body." }) }),
			exited(),
		]);
		const gateway = createRealDispatchAnchorPrGateway(runner);
		const result = await gateway.stampAnchorPrRunId({
			cwd: "/repo",
			prNumber: 612,
			runId: "wf-run-1",
		});

		expect(result.ok).toBe(true);
		expect(calls[0]?.args.slice(0, 3)).toEqual(["pr", "view", "612"]);
		expect(calls[1]?.args.slice(0, 3)).toEqual(["pr", "edit", "612"]);
		const editedBody = calls[1]?.args.at(-1);
		expect(editedBody).toContain("Existing body.");
		expect(editedBody).toContain(buildDispatchRunIdStamp("wf-run-1"));
	});
});
