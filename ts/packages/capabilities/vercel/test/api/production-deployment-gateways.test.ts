import { describe, expect, it } from "vitest";

import { productionRepositoryRootArgument } from "../../scripts/deploy-production.ts";
import {
	isProductionHealthPayload,
	parseVercelDeploymentLocator,
	parseVercelInspection,
	PRODUCTION_WORKSPACE_INSTALL_ARGS,
	productionWorkspaceInstallRoot,
	redactProductionDiagnostic,
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

	it("installs the locked dependency closure from the detached pnpm workspace root", () => {
		expect(productionWorkspaceInstallRoot("/detached")).toBe("/detached/ts");
		expect(PRODUCTION_WORKSPACE_INSTALL_ARGS).toEqual([
			"pnpm",
			"--filter",
			"@nseng-ai/vercel...",
			"install",
			"--frozen-lockfile",
		]);
	});
});

describe("Vercel production JSON boundaries", () => {
	it("parses only bounded deployment locator fields", () => {
		expect(
			parseVercelDeploymentLocator('{"id":"dpl_1","url":"demo.vercel.app","token":"secret"}'),
		).toEqual({
			deploymentId: "dpl_1",
			deploymentUrl: "https://demo.vercel.app/",
		});
	});

	it("accepts explicit credential-free HTTPS deployment URLs", () => {
		expect(
			parseVercelDeploymentLocator('{"id":"dpl_1","url":"https://demo.vercel.app/path"}'),
		).toEqual({
			deploymentId: "dpl_1",
			deploymentUrl: "https://demo.vercel.app/path",
		});
	});

	it.each([
		"http://demo.vercel.app",
		"ftp://demo.vercel.app",
		"https//demo.vercel.app",
		"https:demo.vercel.app",
		"https:///demo.vercel.app",
		"demo.vercel.app/path",
		"demo.vercel.app\\path",
		"https://demo.vercel.app\\path",
		"https://user:password@demo.vercel.app",
		"https://",
	])("rejects invalid deploy URL %s even when a valid id is present", (url) => {
		expect(parseVercelDeploymentLocator(JSON.stringify({ id: "dpl_1", url }))).toBeUndefined();
	});

	it("rejects one invalid URL field instead of falling back to another valid field", () => {
		expect(
			parseVercelDeploymentLocator(
				'{"id":"dpl_1","url":"http://bad.example","deploymentUrl":"good.vercel.app"}',
			),
		).toBeUndefined();
		expect(
			parseVercelInspection(
				'{"id":"dpl_1","url":"http://bad.example","deploymentUrl":"good.vercel.app","status":"READY"}',
			),
		).toBeUndefined();
	});

	it("rejects malformed or identity-free deploy output", () => {
		expect(parseVercelDeploymentLocator("not json")).toBeUndefined();
		expect(parseVercelDeploymentLocator('{"status":"ready"}')).toBeUndefined();
	});

	it("parses host-only and explicit HTTPS inspection identity", () => {
		for (const url of ["demo.vercel.app", "https://demo.vercel.app"]) {
			expect(
				parseVercelInspection(JSON.stringify({ id: "dpl_1", url, readyState: "READY" })),
			).toEqual({
				deploymentId: "dpl_1",
				deploymentUrl: "https://demo.vercel.app/",
				status: "ready",
			});
		}
	});

	it.each([
		"http://demo.vercel.app",
		"ssh://demo.vercel.app",
		"https//demo.vercel.app",
		"https:demo.vercel.app",
		"https:///demo.vercel.app",
		"demo.vercel.app/path",
		"demo.vercel.app\\path",
		"https://demo.vercel.app\\path",
		"https://user:password@demo.vercel.app",
	])("rejects invalid inspection URL %s despite otherwise valid identity", (url) => {
		expect(
			parseVercelInspection(JSON.stringify({ id: "dpl_1", url, readyState: "READY" })),
		).toBeUndefined();
	});

	it("rejects malformed and missing inspection identity", () => {
		expect(parseVercelInspection("not json")).toBeUndefined();
		expect(parseVercelInspection('{"id":"dpl_1","readyState":"READY"}')).toBeUndefined();
		expect(parseVercelInspection('{"url":"demo.vercel.app","readyState":"READY"}')).toBeUndefined();
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
