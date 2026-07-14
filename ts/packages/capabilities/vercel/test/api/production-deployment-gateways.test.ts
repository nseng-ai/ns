import { describe, expect, it } from "vitest";

import { productionRepositoryRootArgument } from "../../scripts/deploy-production.ts";
import {
	isProductionHealthPayload,
	parseVercelDeploymentLocator,
	redactProductionDiagnostic,
	parseVercelInspection,
	VERCEL_PRODUCTION_DEPLOY_ARGS,
	vercelInspectArgs,
} from "../../src/deployability/real-production-deployment-gateways.ts";

describe("Vercel production command shape", () => {
	it("accepts repository-root forwarding with or without pnpm's literal delimiter", () => {
		expect(productionRepositoryRootArgument(["/repo"])).toBe("/repo");
		expect(productionRepositoryRootArgument(["--", "/repo"])).toBe("/repo");
		expect(() => productionRepositoryRootArgument(["/repo", "/other"])).toThrow(
			"accepts one repository root",
		);
	});

	it("uses the repository-root prebuilt production contract", () => {
		expect(VERCEL_PRODUCTION_DEPLOY_ARGS).toEqual([
			"deploy",
			"--prebuilt",
			"--scope",
			"schrockns-projects",
			"--prod",
			"--yes",
			"--format=json",
		]);
		expect(vercelInspectArgs("dpl_example")).toEqual([
			"inspect",
			"dpl_example",
			"--wait",
			"--timeout",
			"2m",
			"--format=json",
		]);
	});
});

describe("Vercel production JSON boundaries", () => {
	it("parses only bounded deployment locator fields", () => {
		expect(
			parseVercelDeploymentLocator('{"id":"dpl_1","url":"demo.vercel.app","token":"secret"}'),
		).toEqual({
			deploymentId: "dpl_1",
			deploymentUrl: "https://demo.vercel.app",
		});
	});

	it("rejects malformed or identity-free deploy output", () => {
		expect(parseVercelDeploymentLocator("not json")).toBeUndefined();
		expect(parseVercelDeploymentLocator('{"status":"ready"}')).toBeUndefined();
	});

	it("parses ready inspection identity and rejects missing identity", () => {
		expect(
			parseVercelInspection('{"id":"dpl_1","url":"demo.vercel.app","readyState":"READY"}'),
		).toEqual({
			deploymentId: "dpl_1",
			deploymentUrl: "https://demo.vercel.app",
			status: "ready",
		});
		expect(parseVercelInspection('{"id":"dpl_1","readyState":"READY"}')).toBeUndefined();
	});

	it("redacts common credential forms from diagnostics", () => {
		expect(
			redactProductionDiagnostic(
				"Bearer abc.def token=supersecret https://user:password@example.test/path",
			),
		).toBe("Bearer [REDACTED] token=[REDACTED] https://[REDACTED]@example.test/path");
	});

	it("requires the exact public health payload", () => {
		expect(isProductionHealthPayload({ service: "ns-dispatch", status: "ok" })).toBe(true);
		expect(isProductionHealthPayload({ service: "ns-dispatch", status: "ok", extra: true })).toBe(
			false,
		);
		expect(isProductionHealthPayload({ service: "other", status: "ok" })).toBe(false);
	});
});
