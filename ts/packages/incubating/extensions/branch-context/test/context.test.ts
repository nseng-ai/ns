import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { BranchCreationProvider } from "@nseng-ai/extension-kit/branch-creation";
import { FakeBrmemGateway } from "@nseng-ai/brmem";
import {
	prepareBranchContextCreation,
	selectBranchCreationForContext,
	type BranchContextContext,
} from "../src/core/context.ts";

function projectConfig(source: string | undefined): ProjectConfigGateway {
	return {
		readTextFile: () =>
			source === undefined ? { type: "missing" } : { type: "found", text: source },
		pathExists: () => ({ type: "missing" }),
	};
}

function context(): BranchContextContext {
	return {
		commands: {
			exec: async () => ({ type: "exited", code: 0, signal: null, stdout: "", stderr: "" }),
		},
		git: new InMemoryGitGateway({ repoRoot: "/repo" }),
		brmem: new FakeBrmemGateway(),
	};
}

describe("branch context creation preparation", () => {
	test("returns a prepared plain Git selection", async () => {
		const baseContext = context();
		const selectedContext = await selectBranchCreationForContext(baseContext, "/repo", {
			projectConfigGateway: projectConfig(undefined),
		});

		const prepared = await prepareBranchContextCreation({
			context: selectedContext,
			cwd: "/repo",
		});

		expect(prepared).toEqual({
			context: selectedContext,
			branchCreation: "plain-git",
		});
	});

	test("selects configured Graphite lazily", async () => {
		let graphiteConstructions = 0;
		const graphiteProvider: BranchCreationProvider = {
			mode: "graphite",
			async createBranch() {
				throw new Error("not used by preparation");
			},
		};
		const baseContext = context();

		const plain = await selectBranchCreationForContext(baseContext, "/repo", {
			projectConfigGateway: projectConfig(undefined),
			createGraphiteProvider: () => {
				graphiteConstructions += 1;
				return graphiteProvider;
			},
		});
		expect(plain.branchCreation.mode).toBe("plain-git");
		expect(graphiteConstructions).toBe(0);

		const graphite = await selectBranchCreationForContext(baseContext, "/repo", {
			projectConfigGateway: projectConfig('[workflow]\nbranch-creation = "graphite"'),
			createGraphiteProvider: () => {
				graphiteConstructions += 1;
				return graphiteProvider;
			},
		});
		expect(graphite.branchCreation).toBe(graphiteProvider);
		expect(graphiteConstructions).toBe(1);
	});

	test("fails closed for invalid configuration", async () => {
		const preparation = selectBranchCreationForContext(context(), "/repo", {
			projectConfigGateway: projectConfig('[workflow]\nbranch-creation = "jj"'),
		});

		await expect(preparation).rejects.toMatchObject({
			name: "BranchContextCreationSelectionError",
			code: "invalid-branch-creation",
		});
	});
});
