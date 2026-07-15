import { describe, expect, test } from "vitest";

import { buildDispatchRunIdStamp } from "../../src/dispatch/run-id-stamp.ts";
import {
	createRealDispatchAnchorPrGateway,
	parseGhPrCreateUrl,
} from "../../src/dispatch-client/real-anchor-pr-gateway.ts";
import { exited, ScriptedCommandRunner } from "./support/scripted-command-runner.ts";

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
		const commands = new ScriptedCommandRunner([
			exited({ stdout: "https://github.com/nseng-ai/ns/pull/612\n" }),
		]);
		const gateway = createRealDispatchAnchorPrGateway(commands.run);
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
		expect(commands.calls[0]?.command).toBe("gh");
		expect(commands.calls[0]?.args).toEqual([
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
		const commands = new ScriptedCommandRunner([
			exited({ stdout: JSON.stringify({ body: "Existing body." }) }),
			exited(),
		]);
		const gateway = createRealDispatchAnchorPrGateway(commands.run);
		const result = await gateway.stampAnchorPrRunId({
			cwd: "/repo",
			prNumber: 612,
			runId: "wf-run-1",
		});

		expect(result.ok).toBe(true);
		expect(commands.calls[0]?.args.slice(0, 3)).toEqual(["pr", "view", "612"]);
		expect(commands.calls[1]?.args.slice(0, 3)).toEqual(["pr", "edit", "612"]);
		const editedBody = commands.calls[1]?.args.at(-1);
		expect(editedBody).toContain("Existing body.");
		expect(editedBody).toContain(buildDispatchRunIdStamp("wf-run-1"));
	});
});
