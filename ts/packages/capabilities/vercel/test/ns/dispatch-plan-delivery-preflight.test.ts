import { FakeBrmemGateway } from "@nseng-ai/brmem";
import { describe, expect, test } from "vitest";

import { preflightDispatchBrmemSetup } from "../../src/ns/dispatch-plan/delivery-preflight.ts";

const BRMEM_REFSPEC = "refs/brmem/*:refs/brmem/*";

describe("preflightDispatchBrmemSetup", () => {
	test("accepts a remote already configured for Branch Memory synchronization", async () => {
		const gateway = new FakeBrmemGateway({
			remotes: {
				origin: {
					push: ["HEAD", BRMEM_REFSPEC],
					fetch: ["+refs/heads/*:refs/remotes/origin/*", BRMEM_REFSPEC],
				},
			},
		});

		await expect(preflightDispatchBrmemSetup(gateway)).resolves.toEqual({
			status: "ready",
			remote: "origin",
		});
	});

	test("refuses before delivery when setup is incomplete and gives the actionable command", async () => {
		const gateway = new FakeBrmemGateway();

		const outcome = await preflightDispatchBrmemSetup(gateway);

		expect(outcome).toEqual({
			status: "setup-required",
			remote: "origin",
			setupCommand: "brmem setup-git",
			message: expect.stringContaining("Run `brmem setup-git`, then dispatch again."),
		});
		expect(await gateway.getRemoteConfig("origin")).toEqual({
			type: "found",
			value: { push: [], fetch: ["+refs/heads/*:refs/remotes/origin/*"] },
		});
	});

	test("reports a missing configured remote without trying to create one", async () => {
		const gateway = new FakeBrmemGateway({ remotes: {} });

		const outcome = await preflightDispatchBrmemSetup(gateway, "upstream");

		expect(outcome).toEqual({
			status: "setup-required",
			remote: "upstream",
			setupCommand: "brmem setup-git --remote upstream",
			message: expect.stringContaining('Git remote "upstream" was not found'),
		});
	});

	test("preserves inspection failures as preflight failures rather than setup advice", async () => {
		const gateway = new FakeBrmemGateway({
			operationErrors: {
				remoteConfig: { code: "git-config-failed", message: "could not read .git/config" },
			},
		});

		await expect(preflightDispatchBrmemSetup(gateway)).resolves.toEqual({
			status: "brmem-preflight-failed",
			remote: "origin",
			message:
				'Could not inspect Branch Memory synchronization for Git remote "origin": could not read .git/config',
		});
	});
});
