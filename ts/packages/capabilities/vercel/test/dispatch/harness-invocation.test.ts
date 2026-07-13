import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
	PI_HARNESS_INVOCATION,
	PI_RUNNER_ENTRY_PATH,
	resolveConfiguredHarnessInvocation,
} from "../../src/dispatch/harness-invocation.ts";

// Mirrors the shape of this repo's actual root ns.toml: other extension
// groups' tables around a [dispatch] table carrying non-harness keys.
const repoLikeSettings = `
[areg]
agents = ["codex", "claude-code"]

[dispatch]
harness = "pi"
vercel_project_id = "prj_fixture"
vercel_team_id = "team_fixture"

[points]
"flow.submit.pre" = ["just"]
`;

describe("resolveConfiguredHarnessInvocation", () => {
	it('resolves harness = "pi" to the ns-owned pi runner recipe', () => {
		const result = resolveConfiguredHarnessInvocation(repoLikeSettings);

		expect(result).toEqual({ ok: true, value: PI_HARNESS_INVOCATION });
	});

	it("reports harness-not-configured when the checkout has no ns.toml", () => {
		const result = resolveConfiguredHarnessInvocation(null);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("harness-not-configured");
	});

	it("reports harness-not-configured when ns.toml has no [dispatch] table", () => {
		const result = resolveConfiguredHarnessInvocation('[areg]\nagents = ["codex"]\n');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("harness-not-configured");
	});

	it("reports harness-not-configured when the [dispatch] table declares no harness", () => {
		const result = resolveConfiguredHarnessInvocation(
			'[dispatch]\nvercel_project_id = "prj_fixture"\n',
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("harness-not-configured");
	});

	it("reports dispatch-settings-invalid for unparseable TOML", () => {
		const result = resolveConfiguredHarnessInvocation("[dispatch\nharness =");

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("dispatch-settings-invalid");
	});

	it("reports dispatch-settings-invalid when harness is not a string", () => {
		const result = resolveConfiguredHarnessInvocation("[dispatch]\nharness = 42\n");

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("dispatch-settings-invalid");
	});

	it("reports unsupported-harness for a harness with no recipe, naming it", () => {
		const result = resolveConfiguredHarnessInvocation('[dispatch]\nharness = "claude-code"\n');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("unsupported-harness");
		expect(result.message).toContain("claude-code");
	});
});

describe("PI_HARNESS_INVOCATION", () => {
	it("launches the runner entry from the checkout with node", () => {
		expect(PI_HARNESS_INVOCATION.launchCommand).toEqual({
			cmd: "node",
			args: [PI_RUNNER_ENTRY_PATH],
		});
	});

	it("names a runner entry module that actually exists in this checkout", () => {
		// The recipe references the runner by checkout-relative path string
		// (imports must flow one way between the dispatch and pi-runner
		// subpackages), so this guards the path against drift.
		const repoRoot = new URL("../../../../../../", import.meta.url);
		expect(existsSync(new URL(PI_RUNNER_ENTRY_PATH, repoRoot))).toBe(true);
	});

	it("provisions git identity and the pinned workspace install before launch", () => {
		const commands = PI_HARNESS_INVOCATION.provisionCommands.map(
			(command) => `${command.cmd} ${command.args.join(" ")}`,
		);
		expect(commands.some((line) => line.includes("git config --global user.name"))).toBe(true);
		expect(commands.some((line) => line.includes("git config --global user.email"))).toBe(true);
		expect(commands.some((line) => line.includes("npm install --global pnpm@"))).toBe(true);
		expect(
			commands.some((line) =>
				line.includes("pnpm --dir ts install --frozen-lockfile --filter @nseng-ai/vercel..."),
			),
		).toBe(true);
	});

	it("names the model key by name only — never a value", () => {
		expect(PI_HARNESS_INVOCATION.launchEnvironmentVariableNames).toEqual(["ANTHROPIC_API_KEY"]);
		expect(JSON.stringify(PI_HARNESS_INVOCATION)).not.toContain("sk-");
	});
});
