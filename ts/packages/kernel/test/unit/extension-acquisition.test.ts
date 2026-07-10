import { describe, expect, test } from "vitest";

import {
	npmPackageRoot,
	parseExtensionSourceSpec,
	resolveDeclaredExtensionModules,
} from "../../src/extensions/acquisition.ts";
import { FakeExtensionAcquisitionGateway } from "../../src/testing/index.ts";

describe("extension acquisition", () => {
	test("parses npm specs without splitting scoped package names at the leading @", () => {
		expect(parseExtensionSourceSpec("/repo", "npm:left-pad")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "left-pad", version: undefined, isPinned: false },
		});
		expect(parseExtensionSourceSpec("/repo", "npm:left-pad@1.3.0")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "left-pad", version: "1.3.0", isPinned: true },
		});
		expect(parseExtensionSourceSpec("/repo", "npm:@scope/pkg")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "@scope/pkg", version: undefined, isPinned: false },
		});
		expect(parseExtensionSourceSpec("/repo", "npm:@scope/pkg@1.2.3")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "@scope/pkg", version: "1.2.3", isPinned: true },
		});
	});

	test("reports malformed npm specs and reserved git specs as per-spec diagnostics", async () => {
		expect(parseExtensionSourceSpec("/repo", "npm:")).toMatchObject({
			ok: false,
			error: { code: "extension_acquisition_invalid_npm_spec" },
		});
		const gateway = new FakeExtensionAcquisitionGateway();
		const result = await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["git:github/acme/ext@main", "./local"],
			mode: "apply",
			gateway,
		});
		expect(result.roots).toEqual([
			{ spec: "./local", sourceKind: "local", moduleRoot: "/repo/local" },
		]);
		expect(result.diagnostics).toMatchObject([
			{ code: "extension_acquisition_git_unsupported", spec: "git:github/acme/ext@main" },
		]);
	});

	test("computes managed node_modules package roots including scoped packages", () => {
		expect(npmPackageRoot("/repo", "left-pad")).toBe(
			"/repo/.ns/managed-extensions/npm/node_modules/left-pad",
		);
		expect(npmPackageRoot("/repo", "@scope/pkg")).toBe(
			"/repo/.ns/managed-extensions/npm/node_modules/@scope/pkg",
		);
	});

	test("versioned npm specs install when missing and skip when already installed", async () => {
		const gateway = new FakeExtensionAcquisitionGateway();
		const first = await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:@scope/pkg@1.2.3"],
			mode: "apply",
			gateway,
		});
		expect(first.roots).toEqual([
			{
				spec: "npm:@scope/pkg@1.2.3",
				sourceKind: "npm",
				moduleRoot: "/repo/.ns/managed-extensions/npm/node_modules/@scope/pkg",
			},
		]);
		expect(gateway.installs).toEqual([
			{
				rawSpec: "npm:@scope/pkg@1.2.3",
				packageName: "@scope/pkg",
				version: "1.2.3",
				isPinned: true,
			},
		]);

		await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:@scope/pkg@1.2.3"],
			mode: "apply",
			gateway,
		});
		expect(gateway.installs).toHaveLength(1);
	});

	test("ensure does not refresh an already-present floating npm package", async () => {
		const packageRoot = npmPackageRoot("/repo", "left-pad");
		const gateway = new FakeExtensionAcquisitionGateway({
			installedPackageRoots: [packageRoot],
		});
		const result = await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:left-pad"],
			mode: "apply",
			npmAcquisition: "ensure",
			gateway,
		});
		expect(result.roots).toEqual([
			{ spec: "npm:left-pad", sourceKind: "npm", moduleRoot: packageRoot },
		]);
		expect(gateway.installs).toEqual([]);
	});

	test("ensure restores a missing floating npm package", async () => {
		const gateway = new FakeExtensionAcquisitionGateway();
		await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:left-pad"],
			mode: "apply",
			npmAcquisition: "ensure",
			gateway,
		});
		expect(gateway.installs.map((install) => install.rawSpec)).toEqual(["npm:left-pad"]);
	});

	test("explicit floating refresh reinstalls an already-present package", async () => {
		const gateway = new FakeExtensionAcquisitionGateway({
			installedPackageRoots: [npmPackageRoot("/repo", "left-pad")],
		});
		await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:left-pad"],
			mode: "apply",
			npmAcquisition: "refresh-floating",
			gateway,
		});
		expect(gateway.installs.map((install) => install.rawSpec)).toEqual(["npm:left-pad"]);
	});

	test("one npm acquisition failure does not prevent another spec from resolving", async () => {
		const gateway = new FakeExtensionAcquisitionGateway();
		gateway.failSpec = "npm:bad";
		const result = await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:bad", "npm:good"],
			mode: "apply",
			gateway,
		});
		expect(result.roots).toEqual([
			{
				spec: "npm:good",
				sourceKind: "npm",
				moduleRoot: "/repo/.ns/managed-extensions/npm/node_modules/good",
			},
		]);
		expect(result.diagnostics).toMatchObject([
			{ code: "extension_acquisition_npm_install_failed", spec: "npm:bad" },
		]);
	});

	test("fake state and logs are ownership-safe copies", async () => {
		const packageRoot = npmPackageRoot("/repo", "left-pad");
		const gateway = new FakeExtensionAcquisitionGateway({ installedPackageRoots: [packageRoot] });
		await gateway.installNpmPackage({
			projectDir: "/repo/.ns/managed-extensions/npm",
			rawSpec: "npm:other",
			packageName: "other",
			version: undefined,
			isPinned: false,
		});

		const installed = gateway.installed;
		if (installed instanceof Set) installed.clear();
		const installs = gateway.installs;
		if (installs[0] !== undefined) {
			(installs[0] as { rawSpec: string }).rawSpec = "mutated";
		}

		expect(gateway.installed).toContain(packageRoot);
		expect(gateway.installs[0]?.rawSpec).toBe("npm:other");
	});

	test("preview mode does not call mutating gateway methods", async () => {
		const gateway = new FakeExtensionAcquisitionGateway();
		const result = await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:missing"],
			mode: "preview",
			gateway,
		});
		expect(result.roots).toEqual([]);
		expect(result.diagnostics).toMatchObject([
			{ code: "extension_acquisition_preview_skipped", spec: "npm:missing" },
		]);
		expect(gateway.ensureCalls).toBe(0);
		expect(gateway.installs).toEqual([]);
	});
});
