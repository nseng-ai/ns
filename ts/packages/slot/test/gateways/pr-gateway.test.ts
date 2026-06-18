import { describe, expect, it } from "vitest";

import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";

import { FakeSlotPRGateway } from "../../src/gateways/fakes/pr.ts";
import { RealSlotPRGateway } from "../../src/gateways/pr.ts";

class FakeCommandExecApi implements CommandExecApi {
	private readonly results: ExecResult[];
	readonly calls: Array<{ command: string; args: string[]; options?: ExecOptions | undefined }> = [];

	constructor(results: readonly Partial<ExecResult>[]) {
		this.results = results.map((result) => ({ stdout: "", stderr: "", code: 0, killed: false, ...result }));
	}

	async exec(command: string, args: string[], options?: ExecOptions | undefined): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], options });
		return this.results.shift() ?? { stdout: "", stderr: "", code: 0, killed: false };
	}
}

describe("Slot PR gateways", () => {
	it("real adapter maps gh pr view JSON and closes PRs", async () => {
		const execApi = new FakeCommandExecApi([
			{ stdout: JSON.stringify({ number: 7, title: "Title", url: "https://example/7", headRefName: "feature/a", baseRefName: "master", state: "OPEN" }) },
			{},
		]);
		const gateway = new RealSlotPRGateway({ cwd: "/repo", env: { PATH: "/bin" }, execApi });
		expect(await gateway.getPrForBranch("feature/a")).toEqual({
			type: "found",
			pr: { number: 7, title: "Title", url: "https://example/7", head_ref_name: "feature/a", base_ref_name: "master", state: "OPEN" },
		});
		expect(await gateway.closePr(7)).toBeNull();
		expect(execApi.calls.map((call) => [call.command, call.args])).toEqual([
			["gh", ["pr", "view", "feature/a", "--json", "number,title,url,headRefName,baseRefName,state"]],
			["gh", ["pr", "close", "7"]],
		]);
	});

	it("real adapter maps no-PR, command failures, and bad JSON", async () => {
		const missing = new RealSlotPRGateway({ cwd: "/repo", execApi: new FakeCommandExecApi([{ code: 1, stderr: "no pull requests found" }]) });
		expect(await missing.getPrForBranch("feature/a")).toMatchObject({ type: "missing" });

		const failed = new RealSlotPRGateway({ cwd: "/repo", execApi: new FakeCommandExecApi([{ code: 1, stderr: "auth failed" }]) });
		expect(await failed.getPrForBranch("feature/a")).toMatchObject({ type: "failure", failure: { stderr: "auth failed" } });

		const badJson = new RealSlotPRGateway({ cwd: "/repo", execApi: new FakeCommandExecApi([{ stdout: "{" }]) });
		expect(await badJson.getPrForBranch("feature/a")).toMatchObject({ type: "failure" });
	});

	it("fake gateway uses constructor state and records close calls", async () => {
		const gateway = new FakeSlotPRGateway({ prsByBranch: { "feature/a": { number: 1, state: "OPEN" } } });
		expect(await gateway.getPrForBranch("feature/a")).toMatchObject({ type: "found", pr: { state: "OPEN" } });
		expect(await gateway.closePr(1)).toBeNull();
		expect(gateway.closeCalls()).toEqual([1]);
		expect(await gateway.getPrForBranch("feature/a")).toMatchObject({ type: "found", pr: { state: "CLOSED" } });
		expect(await gateway.getPrForBranch("missing")).toMatchObject({ type: "missing" });
	});
});
