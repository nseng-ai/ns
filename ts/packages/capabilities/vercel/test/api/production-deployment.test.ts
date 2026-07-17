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
	it("refuses a dirty tree before workspace preparation or deployment", async () => {
		const { fake, result } = await run({ isDirty: true });
		expect(result).toMatchObject({ ok: false, code: "dirty-repository" });
		expect(fake.operations).toEqual(["inspect-source"]);
		expect(fake.state.isPromoted).toBe(false);
	});

	it("binds workspace preparation and tracked configuration to the captured SHA", async () => {
		const { fake, result } = await run();
		expect(result.ok).toBe(true);
		expect(fake.state.preparedCommitSha).toBe("a".repeat(40));
		expect(fake.state.configurationCommitSha).toBe("a".repeat(40));
	});

	it("cleans a partial workspace after preparation failure", async () => {
		const { fake, result } = await run({ preparationFails: true });
		expect(result).toMatchObject({ ok: false, code: "source-build-failed" });
		expect(fake.operations).toEqual([
			"inspect-source",
			"prepare-workspace",
			"cleanup-partial-workspace",
		]);
	});

	it("reports source build failure and disposes the workspace", async () => {
		const { fake, result } = await run({ buildFails: true });
		expect(result).toMatchObject({ ok: false, code: "source-build-failed" });
		expect(fake.operations).toContain("dispose-workspace");
		expect(fake.state.isDisposed).toBe(true);
	});

	it.each(["head", "dirty"] as const)(
		"rejects %s source revalidation failure before promotion or upload",
		async (sourceRevalidationFails) => {
			const { fake, result } = await run({ sourceRevalidationFails });
			expect(result).toMatchObject({ ok: false, code: "source-build-failed" });
			expect(fake.state).toMatchObject({ isPromoted: false, isDisposed: true, isDeployed: false });
		},
	);

	it("rejects package/root identity mismatch and disposes the workspace", async () => {
		const configuration = productionConfiguration({
			repositoryProject: {
				projectId: "prj_other",
				teamId: "team_example",
				projectName: "ns-dispatch",
			},
		});
		const { fake, result } = await run({ configuration });
		expect(result).toMatchObject({ ok: false, code: "project-identity-mismatch" });
		expect(fake.state.isDisposed).toBe(true);
	});

	it("rejects stale or missing manifest inventory and disposes the workspace", async () => {
		const { fake, result } = await run({ promotionFailure: "verification" });
		expect(result).toMatchObject({ ok: false, code: "invalid-artifact" });
		expect(fake.state).toMatchObject({ isOldOutputPresent: true, isDisposed: true });
	});

	it("leaves the destination untouched when staging copy fails", async () => {
		const { fake, result } = await run({
			promotionFailure: "copy",
			staleDestinationFile: "stale-artifact",
		});
		expect(result).toMatchObject({ ok: false, code: "promotion-failed" });
		expect(fake.state).toMatchObject({
			isPromoted: false,
			isOldOutputPresent: true,
			destinationFiles: ["current-artifact", "stale-artifact"],
			isDisposed: true,
		});
	});

	it("restores the old destination when final installation fails after backup", async () => {
		const { fake, result } = await run({ promotionFailure: "install" });
		expect(result).toMatchObject({ ok: false, code: "promotion-failed" });
		expect(fake.state).toMatchObject({
			isPromoted: false,
			isOldOutputPresent: true,
			isDisposed: true,
		});
	});

	it("removes stale destination inventory through clean staged replacement", async () => {
		const { fake, result } = await run({ staleDestinationFile: "stale-artifact" });
		expect(result.ok).toBe(true);
		expect(fake.state.destinationFiles).toEqual(["current-artifact"]);
	});

	it("prevents upload when cleanup fails after promotion and retains isPromoted output", async () => {
		const { fake, result } = await run({ cleanupFails: true });
		expect(result).toMatchObject({ ok: false, code: "source-build-failed" });
		expect(fake.state).toMatchObject({ isPromoted: true, isDeployed: false, isDisposed: false });
	});

	it("cleans before deploy and retains isPromoted output after deploy failure", async () => {
		const { fake, result } = await run({ deployFailure: "definite" });
		expect(result).toMatchObject({ ok: false, code: "deploy-failed" });
		expect(fake.state).toMatchObject({
			isPromoted: true,
			isOldOutputPresent: false,
			isDisposed: true,
		});
		expect(fake.operations.indexOf("dispose-workspace")).toBeLessThan(
			fake.operations.indexOf("deploy"),
		);
	});

	it("inspects the deployment and alias under the validated team", async () => {
		const configuration = productionConfiguration({ configuredTeamId: "team_validated" });
		const { fake, result } = await run({
			configuration: productionConfiguration({
				configuredTeamId: "team_validated",
				packageProject: { ...configuration.packageProject, teamId: "team_validated" },
				repositoryProject: { ...configuration.repositoryProject, teamId: "team_validated" },
			}),
		});
		expect(result.ok).toBe(true);
		expect(fake.state.inspectedTeamIds).toEqual(["team_validated", "team_validated"]);
	});

	it("rejects an alias pointing at another immutable deployment", async () => {
		const { fake, result } = await run({ aliasDeploymentId: "dpl_other" });
		expect(result).toMatchObject({ ok: false, code: "alias-mismatch" });
		expect(fake.state.isPromoted).toBe(true);
	});

	it("recovers an ambiguous deploy transport failure by inspecting its locator", async () => {
		const { result } = await run({ deployFailure: "ambiguous" });
		expect(result).toMatchObject({ ok: true, value: { deploymentId: "dpl_example" } });
	});

	it("reports the stable URL, revalidated SHA, project, and digest after ordered verification", async () => {
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
			"Preparing detached production source workspace.",
			"Building package deployable from captured source.",
			"Revalidating detached production source.",
			"Validating dispatch project identity.",
			"Transactionally promoting verified Build Output.",
			"Cleaning detached production source workspace.",
			"Deploying prebuilt output to Vercel production.",
			"Inspecting immutable deployment identity.",
			"Verifying production alias identity.",
		]);
	});
});
