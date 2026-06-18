import { describe, expect, it } from "vitest";

import { FakeSlotGitGateway } from "../../src/gateways/fakes/git.ts";

describe("FakeSlotGitGateway branch deletion", () => {
	it("deletes local branches and logs the operation", async () => {
		const gateway = new FakeSlotGitGateway({ localBranches: ["master", "feature/a"] });
		expect(await gateway.branchExists("feature/a")).toBe(true);
		expect(await gateway.deleteLocalBranch("feature/a", { shouldForce: true })).toBeNull();
		expect(await gateway.branchExists("feature/a")).toBe(false);
		expect(gateway.operations()).toContainEqual({ type: "delete-local-branch", branch: "feature/a", shouldForce: true });
	});

	it("preserves local branch on configured deletion failure", async () => {
		const gateway = new FakeSlotGitGateway({
			localBranches: ["master", "feature/a"],
			deleteBranchFailures: { "feature/a": { message: "cannot delete", returncode: 1 } },
		});
		expect(await gateway.deleteLocalBranch("feature/a", { shouldForce: true })).toEqual({ message: "cannot delete", returncode: 1 });
		expect(await gateway.branchExists("feature/a")).toBe(true);
	});
});
