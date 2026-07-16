import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
	dispatchHarnessValues,
	DISPATCH_CHECKOUT_PACKAGE_ROOT,
	DISPATCH_PACKAGE_MANAGER_FIELD,
	isDispatchHarness,
	parseDispatchPackageManagerSource,
	PI_RUNNER_ENTRY_PATH,
	type HarnessInvocation,
} from "../../src/dispatch/harness-registry.ts";
import { resolveConfiguredHarnessInvocation } from "../../src/dispatch/harness-invocation.ts";

// Mirrors this repo's ns.toml shape: unrelated tables surround [dispatch],
// which carries project-linkage keys beyond the harness selector.
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

function packageManagerSource(value = "pnpm@11.8.1"): string {
	return JSON.stringify({ name: "fixture", packageManager: value });
}

function resolvedInvocation(
	settingsSource = repoLikeSettings,
	manifestSource = packageManagerSource(),
): HarnessInvocation {
	const result = resolveConfiguredHarnessInvocation(settingsSource, manifestSource);
	if (result.ok === false) throw new Error(`Expected an invocation: ${result.message}`);
	return result.value;
}

describe("dispatch harness registry", () => {
	it("implements only Pi and derives its runtime guard from the registry", () => {
		expect(dispatchHarnessValues).toEqual(["pi"]);
		expect(isDispatchHarness("pi")).toBe(true);
		expect(isDispatchHarness("claude-code")).toBe(false);
		expect(isDispatchHarness("arbitrary")).toBe(false);
	});
});

describe("parseDispatchPackageManagerSource", () => {
	it("returns the exact stable pnpm version separately", () => {
		const result = parseDispatchPackageManagerSource(packageManagerSource("pnpm@11.8.1"));

		expect(result).toEqual({ ok: true, value: { pnpmVersion: "11.8.1" } });
	});

	it.each([
		["missing manifest", null],
		["malformed JSON", "{"],
		["non-object manifest", "[]"],
		["missing packageManager", "{}"],
		["non-string packageManager", '{"packageManager":11}'],
		["another manager", packageManagerSource("npm@11.8.1")],
		["missing version", packageManagerSource("pnpm")],
		["empty version", packageManagerSource("pnpm@")],
		["major-only range", packageManagerSource("pnpm@11")],
		["caret range", packageManagerSource("pnpm@^11.8.1")],
		["comparison range", packageManagerSource("pnpm@>=11.8.1")],
		["tag", packageManagerSource("pnpm@latest")],
		["prerelease", packageManagerSource("pnpm@11.8.1-rc.1")],
		["integrity suffix", packageManagerSource("pnpm@11.8.1+sha512.deadbeef")],
		["leading whitespace", packageManagerSource(" pnpm@11.8.1")],
		["trailing whitespace", packageManagerSource("pnpm@11.8.1 ")],
		["internal whitespace", packageManagerSource("pnpm@ 11.8.1")],
		["shell separator", packageManagerSource("pnpm@11.8.1;touch-pwned")],
		["shell substitution", packageManagerSource("pnpm@11.8.$(touch-pwned)")],
		["leading-zero semver", packageManagerSource("pnpm@011.8.1")],
	] as const)("rejects %s with a structured value-free failure", (_label, source) => {
		const result = parseDispatchPackageManagerSource(source);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a package-manager failure.");
		expect(result.error.field).toBe(DISPATCH_PACKAGE_MANAGER_FIELD);
		expect(result.error.message).toContain("ts/package.json#packageManager");
		expect(result.error.message).not.toContain("touch-pwned");
	});
});

describe("resolveConfiguredHarnessInvocation", () => {
	it('resolves harness = "pi" with pnpm as one exact argv element', () => {
		const invocation = resolvedInvocation(repoLikeSettings, packageManagerSource("pnpm@11.8.1"));

		expect(invocation.provisionCommands).toContainEqual({
			cmd: "npm",
			args: ["install", "--global", "pnpm@11.8.1"],
		});
	});

	it("reports harness-not-configured when the checkout has no ns.toml", () => {
		const result = resolveConfiguredHarnessInvocation(null, packageManagerSource());

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("harness-not-configured");
	});

	it("reports harness-not-configured when ns.toml has no [dispatch] table", () => {
		const result = resolveConfiguredHarnessInvocation(
			'[areg]\nagents = ["codex"]\n',
			packageManagerSource(),
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("harness-not-configured");
	});

	it("reports harness-not-configured when [dispatch] declares no harness", () => {
		const result = resolveConfiguredHarnessInvocation(
			'[dispatch]\nvercel_project_id = "prj_fixture"\n',
			packageManagerSource(),
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("harness-not-configured");
	});

	it("reports dispatch-settings-invalid for unparseable TOML", () => {
		const result = resolveConfiguredHarnessInvocation(
			"[dispatch\nharness =",
			packageManagerSource(),
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("dispatch-settings-invalid");
	});

	it("reports dispatch-settings-invalid when harness is not a string", () => {
		const result = resolveConfiguredHarnessInvocation(
			"[dispatch]\nharness = 42\n",
			packageManagerSource(),
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("dispatch-settings-invalid");
	});

	it("reports unsupported-harness for a name absent from the registry", () => {
		const result = resolveConfiguredHarnessInvocation(
			'[dispatch]\nharness = "claude-code"\n',
			packageManagerSource(),
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("unsupported-harness");
		expect(result.message).not.toContain("claude-code");
	});

	it("propagates a value-free package-manager failure", () => {
		const invalidValue = "pnpm@11.8.1;do-not-expose";
		const result = resolveConfiguredHarnessInvocation(
			repoLikeSettings,
			packageManagerSource(invalidValue),
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("package-manager-invalid");
		expect(result.message).toContain(DISPATCH_PACKAGE_MANAGER_FIELD);
		expect(result.message).not.toContain(invalidValue);
	});
});

describe("Pi invocation recipe", () => {
	it("launches the runner entry derived from the package root with node", () => {
		expect(PI_RUNNER_ENTRY_PATH).toBe(`${DISPATCH_CHECKOUT_PACKAGE_ROOT}/src/pi-runner/main.ts`);
		expect(resolvedInvocation().launchCommand).toEqual({
			cmd: "node",
			args: [PI_RUNNER_ENTRY_PATH],
		});
	});

	it("names a runner entry module that actually exists in this checkout", () => {
		const repoRoot = new URL("../../../../../../", import.meta.url);
		expect(existsSync(new URL(PI_RUNNER_ENTRY_PATH, repoRoot))).toBe(true);
	});

	it("provisions git identity and the pinned workspace install before launch", () => {
		const commands = resolvedInvocation().provisionCommands.map(
			(command) => `${command.cmd} ${command.args.join(" ")}`,
		);
		expect(commands.some((line) => line.includes("git config --global user.name"))).toBe(true);
		expect(commands.some((line) => line.includes("git config --global user.email"))).toBe(true);
		expect(commands.some((line) => line.includes("npm install --global pnpm@11.8.1"))).toBe(true);
		expect(
			commands.some((line) =>
				line.includes("pnpm --dir ts install --frozen-lockfile --filter @nseng-ai/vercel..."),
			),
		).toBe(true);
	});

	it("resolves the checked-in ts/package.json to its matching install command", () => {
		const repoRoot = new URL("../../../../../../", import.meta.url);
		const manifestSource = readFileSync(new URL("ts/package.json", repoRoot), "utf8");
		const packageManager = parseDispatchPackageManagerSource(manifestSource);
		if (packageManager.ok === false) {
			throw new Error(
				`Checked-in package-manager contract is invalid: ${packageManager.error.message}`,
			);
		}

		const invocation = resolvedInvocation(repoLikeSettings, manifestSource);
		expect(invocation.provisionCommands).toContainEqual({
			cmd: "npm",
			args: ["install", "--global", `pnpm@${packageManager.value.pnpmVersion}`],
		});
	});

	it("names the model key by name only — never a value", () => {
		const invocation = resolvedInvocation();
		expect(invocation.launchEnvironmentVariableNames).toEqual(["ANTHROPIC_API_KEY"]);
		expect(JSON.stringify(invocation)).not.toContain("sk-");
	});
});
