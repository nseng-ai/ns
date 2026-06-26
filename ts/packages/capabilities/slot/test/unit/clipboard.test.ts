import { describe, expect, it } from "vitest";

import {
	FakeClipboardGateway,
	RealClipboardGateway,
	type ClipboardProcessRunner,
} from "../../src/gateways/clipboard.ts";

describe("clipboard gateway primitives", () => {
	it("reports copied success", async () => {
		const gateway = new RealClipboardGateway({ runner: new ScriptedRunner({ type: "success" }) });
		await expect(gateway.copy("hello")).resolves.toEqual({ type: "copied" });
	});

	it("reports backend_missing failure", async () => {
		const gateway = new RealClipboardGateway({
			runner: new ScriptedRunner({ type: "failure", reason: "backend_missing", detail: "missing" }),
		});
		await expect(gateway.copy("hello")).resolves.toEqual({
			type: "failure",
			reason: "backend_missing",
			detail: "missing",
		});
	});

	it("reports subprocess_error failure", async () => {
		const gateway = new RealClipboardGateway({
			runner: new ScriptedRunner({ type: "failure", reason: "subprocess_error", detail: "bad" }),
		});
		await expect(gateway.copy("hello")).resolves.toEqual({
			type: "failure",
			reason: "subprocess_error",
			detail: "bad",
		});
	});

	it("fake records attempted copied text without touching the real clipboard", async () => {
		const gateway = new FakeClipboardGateway({
			type: "failure",
			reason: "backend_missing",
			detail: "missing",
		});
		await expect(gateway.copy("cd /tmp")).resolves.toMatchObject({
			type: "failure",
			reason: "backend_missing",
		});
		expect(gateway.texts()).toEqual(["cd /tmp"]);
	});
});

class ScriptedRunner implements ClipboardProcessRunner {
	private readonly result: Awaited<ReturnType<ClipboardProcessRunner["runPbcopy"]>>;

	constructor(result: Awaited<ReturnType<ClipboardProcessRunner["runPbcopy"]>>) {
		this.result = result;
	}

	async runPbcopy(
		_input: string,
	): Promise<Awaited<ReturnType<ClipboardProcessRunner["runPbcopy"]>>> {
		return { ...this.result };
	}
}
