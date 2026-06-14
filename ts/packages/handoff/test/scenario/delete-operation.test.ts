import { describe, expect, test } from "vitest";

import { FakeBrmemGateway } from "../../src/fake-brmem-gateway.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("handoff delete", () => {
	test("force deletes current branch handoff", async () => {
		const gateway = new FakeBrmemGateway();
		gateway.put("handoff", "alpha.md", "feat/x", "alpha");
		gateway.put("handoff", "bravo.md", "feat/x", "bravo");

		const run = runScenario(["delete", "--force", "alpha", "--format", "json"], { brmem: gateway });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				branch: "feat/x",
				slug: "alpha",
				key: "alpha.md",
				entry_locator: "refs/brmem/ns/handoff/feat---x:alpha.md",
				deleted: true,
				cancelled: false,
				commit: "fake-0003",
			},
		});
		expect(gateway.get("handoff", "alpha.md", "feat/x")).toBeUndefined();
		expect(gateway.get("handoff", "bravo.md", "feat/x")).toBe("bravo");
	});

	test("explicit deleted branch works in detached head", async () => {
		const gateway = new FakeBrmemGateway();
		gateway.put("handoff", "stale.md", "feat/deleted", "stale");
		const run = runScenario(["delete", "--branch", "feat/deleted", "--force", "stale", "--format", "json"], {
			brmem: gateway,
			gitState: { currentBranch: { type: "detached" }, existingBranches: [] },
		});
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { branch: "feat/deleted", slug: "stale", deleted: true } });
		expect(gateway.get("handoff", "stale.md", "feat/deleted")).toBeUndefined();
	});

	test("prompt accepts and declines with prompts on stderr in JSON mode", async () => {
		const acceptedGateway = new FakeBrmemGateway();
		acceptedGateway.put("handoff", "alpha.md", "feat/x", "alpha");
		const accepted = runScenario(["delete", "alpha"], { brmem: acceptedGateway, stdin: "y\n" });
		expect(await accepted.exit).toBe(0);
		expect(accepted.stderr.join("")).toContain("Delete handoff `alpha` on branch `feat/x`? [y/N]");
		expect(accepted.stdout.join("")).toContain("Deleted handoff `alpha` on branch `feat/x`.");
		expect(acceptedGateway.get("handoff", "alpha.md", "feat/x")).toBeUndefined();

		const declinedGateway = new FakeBrmemGateway();
		declinedGateway.put("handoff", "alpha.md", "feat/x", "alpha");
		const declined = runScenario(["delete", "alpha", "--format", "json"], { brmem: declinedGateway, stdin: "no\n" });
		expect(await declined.exit).toBe(0);
		expect(declined.stderr.join("")).toContain("Delete handoff `alpha` on branch `feat/x`? [y/N]");
		expect(parseJsonOutput(declined)).toMatchObject({ data: { deleted: false, cancelled: true, commit: null } });
		expect(declinedGateway.get("handoff", "alpha.md", "feat/x")).toBe("alpha");
	});

	test("validates slug, branch, not-found, and detached head", async () => {
		const md = runScenario(["delete", "alpha.md", "--format", "json"]);
		expect(await md.exit).toBe(2);
		expect(parseJsonOutput(md)).toMatchObject({ error_type: "invalid_handoff_slug" });

		const slash = runScenario(["delete", "nested/alpha", "--format", "json"]);
		expect(await slash.exit).toBe(2);
		expect(parseJsonOutput(slash)).toMatchObject({ error_type: "invalid_handoff_slug" });

		const branch = runScenario(["delete", "--branch", "feat---x", "alpha", "--format", "json"]);
		expect(await branch.exit).toBe(2);
		expect(parseJsonOutput(branch)).toMatchObject({ error_type: "invalid_branch_name" });

		const missing = runScenario(["delete", "--force", "missing", "--format", "json"]);
		expect(await missing.exit).toBe(2);
		expect(parseJsonOutput(missing)).toMatchObject({ error_type: "handoff_not_found", message: "No handoff `missing` found on branch `feat/x`." });

		const detached = runScenario(["delete", "alpha", "--format", "json"], { gitState: { currentBranch: { type: "detached" } } });
		expect(await detached.exit).toBe(2);
		expect(parseJsonOutput(detached)).toMatchObject({ error_type: "detached_head" });
	});
});
