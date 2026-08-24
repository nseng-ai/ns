import { describe, expect, test } from "vitest";

import { createFreshNsCliRunner, type FreshNsCliModuleLoader } from "../src/fresh-ns-cli.ts";

class Loader implements FreshNsCliModuleLoader {
	readonly calls: number[] = [];
	async load() {
		const call = this.calls.length + 1;
		this.calls.push(call);
		return { runNsCli: async () => call };
	}
}

describe("fresh ns CLI runner", () => {
	test("loads for every invocation", async () => {
		const loader = new Loader();
		const runCli = createFreshNsCliRunner(loader);
		const deps = {
			cwd: "/repo",
			env: {},
			stdout() {},
			stderr() {},
			isInteractive: () => false,
			confirm: () => ({ type: "declined" as const }),
			select: () => ({ type: "cancelled" as const }),
		};
		expect(await runCli(["gs"], deps)).toBe(1);
		expect(await runCli(["gs"], deps)).toBe(2);
	});
});
