import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import { FakeObjectiveStorageGateway } from "../../src/core/fake-storage.ts";
import { runResolveOwner } from "../../src/core/operations/resolve-owner.ts";
import { FakeObjectiveOwnerGateway } from "../../src/core/owner-gateway.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

function ctxWith(owner: FakeObjectiveOwnerGateway): ObjectiveCliContext & {
	owner: FakeObjectiveOwnerGateway;
} {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "main",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway({})),
		git: new InMemoryGitGateway(),
		owner,
	};
}

describe("objective exec resolve-owner", () => {
	test("explicit owner wins and performs no GitHub lookup", async () => {
		const ctx = ctxWith(new FakeObjectiveOwnerGateway({ owner: "login-owner" }));
		const exit = await runResolveOwner(ctx, { owner: "explicit-owner" });
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toEqual({ status: "ok", owner: "explicit-owner", source: "explicit" });
		expect(ctx.owner.callCount).toBe(0);
	});

	test("invalid explicit owner is a usage error validated offline", async () => {
		const ctx = ctxWith(new FakeObjectiveOwnerGateway({ owner: "login-owner" }));
		const exit = await runResolveOwner(ctx, { owner: "Bad--Handle" });
		expect(exit.type).toBe("usageError");
		expect(ctx.owner.callCount).toBe(0);
	});

	test("without an explicit owner the authenticated GitHub login is used", async () => {
		const ctx = ctxWith(new FakeObjectiveOwnerGateway({ owner: "login-owner" }));
		const exit = await runResolveOwner(ctx, {});
		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data).toEqual({ status: "ok", owner: "login-owner", source: "github-login" });
	});

	test("missing login without explicit owner fails with --owner guidance", async () => {
		const ctx = ctxWith(new FakeObjectiveOwnerGateway({}));
		const exit = await runResolveOwner(ctx, {});
		expect(exit.type).toBe("negative");
		if (exit.type !== "negative") throw new Error("expected negative exit");
		expect(exit.message).toContain("--owner");
	});
});
