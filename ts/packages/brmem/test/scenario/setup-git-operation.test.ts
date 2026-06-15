import { describe, expect, it } from "vitest";

import { FakeGitSetupGateway, parseJsonOutput, runScenario } from "../support/run-scenario.ts";

const brmemRefspec = "refs/brmem/*:refs/brmem/*";

describe("setup-git operation", () => {
	it("shows help and JSON schema surface", async () => {
		const help = runScenario(["setup-git", "-h"]);
		expect(await help.exit).toBe(0);
		const text = help.stdout.join("");
		for (const flag of ["--remote", "--dry-run", "--format", "--json-schema"]) {
			expect(text).toContain(flag);
		}

		const schema = runScenario(["setup-git", "--json-schema"]);
		expect(await schema.exit).toBe(0);
		const document = parseJsonOutput(schema) as Record<string, unknown>;
		expect(document).toHaveProperty("input_json_schema");
		expect(document).toHaveProperty("output_json_schema");
	});

	it("adds default push preservation, Branch Memory push, and non-force Branch Memory fetch for fresh config", async () => {
		const gateway = new FakeGitSetupGateway({ fetchValues: ["+refs/heads/*:refs/remotes/origin/*"] });
		const run = runScenario(["setup-git"], { gitSetupGateway: gateway });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Configured Git remote origin for Branch Memory Snapshot Refs.");
		expect(gateway.writes).toEqual([
			{ key: "remote.origin.push", value: "HEAD" },
			{ key: "remote.origin.push", value: brmemRefspec },
			{ key: "remote.origin.fetch", value: brmemRefspec },
		]);
		expect(gateway.configValues("remote.origin.fetch")).toContain(brmemRefspec);
		expect(gateway.configValues("remote.origin.fetch")).not.toContain(`+${brmemRefspec}`);
	});

	it("preserves existing custom push config without adding HEAD", async () => {
		const gateway = new FakeGitSetupGateway({
			pushValues: ["refs/heads/main:refs/heads/main"],
			fetchValues: ["+refs/heads/*:refs/remotes/origin/*"],
		});
		const run = runScenario(["setup-git"], { gitSetupGateway: gateway });

		expect(await run.exit).toBe(0);
		expect(gateway.writes).toEqual([
			{ key: "remote.origin.push", value: brmemRefspec },
			{ key: "remote.origin.fetch", value: brmemRefspec },
		]);
	});

	it("does not duplicate already-configured Branch Memory refspecs", async () => {
		const gateway = new FakeGitSetupGateway({
			pushValues: ["HEAD", brmemRefspec],
			fetchValues: ["+refs/heads/*:refs/remotes/origin/*", brmemRefspec],
		});
		const run = runScenario(["setup-git"], { gitSetupGateway: gateway });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("Git remote origin is already configured for Branch Memory Snapshot Refs.\n");
		expect(gateway.writes).toEqual([]);
	});

	it("reports dry-run additions without mutating Git config", async () => {
		const gateway = new FakeGitSetupGateway({ fetchValues: ["+refs/heads/*:refs/remotes/origin/*"] });
		const run = runScenario(["setup-git", "--dry-run"], { gitSetupGateway: gateway });

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Would configure Git remote origin for Branch Memory Snapshot Refs.");
		expect(output).toContain("Would add:");
		expect(gateway.writes).toEqual([]);
		expect(gateway.configValues("remote.origin.push")).toEqual([]);
	});

	it("supports custom remotes and JSON output", async () => {
		const gateway = new FakeGitSetupGateway({ remotes: ["upstream"], fetchValues: [] });
		const run = runScenario(["setup-git", "--remote", "upstream", "--dry-run", "--format", "json"], { gitSetupGateway: gateway });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			exit_code: 0,
			data: {
				remote: "upstream",
				dry_run: true,
				push_refspec: brmemRefspec,
				fetch_refspec: brmemRefspec,
				existing_push: [],
				existing_fetch: [],
				additions: [
					{ key: "remote.upstream.push", value: "HEAD", reason: "preserve-default-push" },
					{ key: "remote.upstream.push", value: brmemRefspec, reason: "branch-memory-push" },
					{ key: "remote.upstream.fetch", value: brmemRefspec, reason: "branch-memory-fetch" },
				],
			},
		});
		expect(gateway.writes).toEqual([]);
	});

	it("fails for a missing or invalid remote", async () => {
		const missing = runScenario(["setup-git", "--remote", "upstream", "--format", "json"], {
			gitSetupGateway: new FakeGitSetupGateway({ remotes: ["origin"] }),
		});
		expect(await missing.exit).toBe(2);
		expect(parseJsonOutput(missing)).toMatchObject({ exit_code: 2, error_type: "remote_not_found" });

		const invalid = runScenario(["setup-git", "--remote", "", "--format", "json"]);
		expect(await invalid.exit).toBe(2);
		expect(parseJsonOutput(invalid)).toMatchObject({ exit_code: 2, error_type: "invalid_remote" });
	});
});
