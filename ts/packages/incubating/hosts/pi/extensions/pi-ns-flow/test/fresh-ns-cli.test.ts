import { describe, expect, test } from "vitest";

import { createFreshNsCliRunner, type FreshNsCliModuleLoader } from "../src/fresh-ns-cli.ts";

class InMemoryFreshNsCliModuleLoader implements FreshNsCliModuleLoader {
	readonly calls: number[] = [];

	async load() {
		const call = this.calls.length + 1;
		this.calls.push(call);
		return {
			runNsCli: async () => call,
		};
	}
}

describe("fresh ns CLI runner", () => {
	test("loads the ns CLI module for every invocation", async () => {
		const loader = new InMemoryFreshNsCliModuleLoader();
		const runCli = createFreshNsCliRunner(loader);
		const deps = {
			cwd: "/repo",
			env: {},
			stdout() {},
			stderr() {},
			isInteractive: () => true,
			confirm: () => ({ type: "declined" as const }),
			select: () => ({ type: "cancelled" as const }),
		};

		expect(await runCli(["flow", "changes"], deps)).toBe(1);
		expect(await runCli(["flow", "changes"], deps)).toBe(2);
		expect(loader.calls).toEqual([1, 2]);
	});
});
