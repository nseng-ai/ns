import { describe, expect, test } from "vitest";

import {
	createFlowGraphiteStackGitGateway,
	type FlowGraphiteStackGitGateway,
} from "../../src/stack-squash/graphite-stack-gateway.ts";

describe("Flow Graphite stack Git adapter", () => {
	test("maps foundation Git common-dir and current-branch facts", async () => {
		const calls: string[] = [];
		const git: FlowGraphiteStackGitGateway = {
			async gitCommonDir({ cwd }) {
				calls.push(`common-dir:${cwd}`);
				return { ok: true, value: "/repo/.git" };
			},
			async currentBranch({ cwd }) {
				calls.push(`current-branch:${cwd}`);
				return { type: "branch", branch: "feature/current" };
			},
		};
		const adapter = createFlowGraphiteStackGitGateway(git);

		expect(await adapter.getGitCommonDir("/repo")).toBe("/repo/.git");
		expect(await adapter.getCurrentBranch("/repo")).toEqual({
			type: "branch",
			branch: "feature/current",
		});
		expect(calls).toEqual(["common-dir:/repo", "current-branch:/repo"]);
	});

	test("maps foundation Git failures into the provider contract", async () => {
		const git: FlowGraphiteStackGitGateway = {
			async gitCommonDir() {
				return {
					ok: false,
					error: { code: "git_common_dir_failed", message: "common dir unavailable" },
				};
			},
			async currentBranch() {
				return {
					type: "failure",
					error: { code: "current-branch-failed", message: "branch unavailable" },
				};
			},
		};
		const adapter = createFlowGraphiteStackGitGateway(git);

		expect(await adapter.getGitCommonDir("/repo")).toBeNull();
		expect(await adapter.getCurrentBranch("/repo")).toEqual({
			type: "failure",
			failure: { message: "branch unavailable" },
		});
	});
});
