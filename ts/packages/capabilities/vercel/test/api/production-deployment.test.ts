import { describe, expect, it } from "vitest";

import { deployDispatchProduction } from "../../src/deployability/production-deployment.ts";
import {
	createProductionDeploymentFake,
	productionConfiguration,
} from "../support/production-deployment-fakes.ts";

async function run(state: Parameters<typeof createProductionDeploymentFake>[0] = {}) {
	const fake = createProductionDeploymentFake(state);
	return { fake, result: await deployDispatchProduction(fake.context) };
}

describe("production deployment workflow", () => {
	it("refuses a dirty tree before build or deployment", async () => {
		const { fake, result } = await run({ isDirty: true });
		expect(result).toMatchObject({ ok: false, code: "dirty-repository" });
		expect(fake.phases).toEqual(["Checking production source state."]);
		expect(fake.state.promoted).toBe(false);
	});

	it("reports source build failure", async () => {
		const { result } = await run({ buildFails: true });
		expect(result).toMatchObject({ ok: false, code: "source-build-failed" });
	});

	it("rejects package/root identity mismatch", async () => {
		const configuration = productionConfiguration({
			repositoryProject: {
				projectId: "prj_other",
				teamId: "team_example",
				projectName: "ns-dispatch",
			},
		});
		const { result } = await run({ configuration });
		expect(result).toMatchObject({ ok: false, code: "project-identity-mismatch" });
	});

	it("rejects stale or missing manifest inventory", async () => {
		const { fake, result } = await run({ promotionFailure: "verification" });
		expect(result).toMatchObject({ ok: false, code: "invalid-artifact" });
		expect(fake.state.oldOutputPresent).toBe(true);
	});

	it("leaves the destination untouched when staging copy fails", async () => {
		const { fake, result } = await run({
			promotionFailure: "copy",
			staleDestinationFile: "stale-artifact",
		});
		expect(result).toMatchObject({ ok: false, code: "promotion-failed" });
		expect(fake.state).toMatchObject({
			promoted: false,
			oldOutputPresent: true,
			destinationFiles: ["current-artifact", "stale-artifact"],
		});
	});

	it("restores the old destination when final installation fails after backup", async () => {
		const { fake, result } = await run({ promotionFailure: "install" });
		expect(result).toMatchObject({ ok: false, code: "promotion-failed" });
		expect(fake.state).toMatchObject({ promoted: false, oldOutputPresent: true });
	});

	it("removes stale destination inventory through clean staged replacement", async () => {
		const { fake, result } = await run({ staleDestinationFile: "stale-artifact" });
		expect(result.ok).toBe(true);
		expect(fake.state.destinationFiles).toEqual(["current-artifact"]);
	});

	it("retains promoted output after deploy failure", async () => {
		const { fake, result } = await run({ deployFailure: "definite" });
		expect(result).toMatchObject({ ok: false, code: "deploy-failed" });
		expect(fake.state).toMatchObject({ promoted: true, oldOutputPresent: false });
	});

	it("rejects an alias pointing at another immutable deployment", async () => {
		const { fake, result } = await run({ aliasDeploymentId: "dpl_other" });
		expect(result).toMatchObject({ ok: false, code: "alias-mismatch" });
		expect(fake.state.promoted).toBe(true);
	});

	it("recovers an ambiguous deploy transport failure by inspecting its locator", async () => {
		const { result } = await run({ deployFailure: "ambiguous" });
		expect(result).toMatchObject({ ok: true, value: { deploymentId: "dpl_example" } });
	});

	it("reports the stable URL, SHA, project, and digest after ordered verification", async () => {
		const { fake, result } = await run();
		expect(result).toEqual({
			ok: true,
			value: {
				status: "ok",
				deploymentId: "dpl_example",
				deploymentUrl: "https://deployment.vercel.app",
				productionAlias: "https://ns-dispatch.vercel.app",
				gitCommitSha: "a".repeat(40),
				projectId: "prj_example",
				artifactDigest: `sha256:${"b".repeat(64)}`,
			},
		});
		expect(fake.phases).toEqual([
			"Checking production source state.",
			"Building package-local deployable.",
			"Validating dispatch project identity.",
			"Transactionally promoting verified Build Output.",
			"Deploying prebuilt output to Vercel production.",
			"Inspecting immutable deployment identity.",
			"Verifying production alias identity.",
		]);
	});
});
