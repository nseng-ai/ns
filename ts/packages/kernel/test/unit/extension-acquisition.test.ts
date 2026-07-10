import { describe, expect, test } from "vitest";

import {
	managedNpmProjectRoot,
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

	test("computes independent private project and installed package roots", () => {
		expect(managedNpmProjectRoot("/repo", "left-pad")).toBe(
			"/repo/.ns/managed-extensions/npm/left-pad",
		);
		expect(npmPackageRoot("/repo", "left-pad")).toBe(
			"/repo/.ns/managed-extensions/npm/left-pad/node_modules/left-pad",
		);
		expect(managedNpmProjectRoot("/repo", "@scope/pkg")).toBe(
			"/repo/.ns/managed-extensions/npm/@scope/pkg",
		);
		expect(npmPackageRoot("/repo", "@scope/pkg")).toBe(
			"/repo/.ns/managed-extensions/npm/@scope/pkg/node_modules/@scope/pkg",
		);
		expect(managedNpmProjectRoot("/repo", "first")).not.toBe(
			managedNpmProjectRoot("/repo", "second"),
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
				moduleRoot: "/repo/.ns/managed-extensions/npm/@scope/pkg/node_modules/@scope/pkg",
			},
		]);
		expect(gateway.installs).toEqual([
			{
				projectDir: "/repo/.ns/managed-extensions/npm/@scope/pkg",
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

	test("two installs use distinct roots and failed B leaves A resolvable", async () => {
		const gateway = new FakeExtensionAcquisitionGateway();
		const first = await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:good"],
			mode: "apply",
			gateway,
		});
		gateway.failSpec = "npm:bad";
		const second = await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:good", "npm:bad"],
			mode: "apply",
			gateway,
		});
		expect(first.roots).toEqual([
			{
				spec: "npm:good",
				sourceKind: "npm",
				moduleRoot: "/repo/.ns/managed-extensions/npm/good/node_modules/good",
			},
		]);
		expect(second.roots).toEqual(first.roots);
		expect(second.diagnostics).toMatchObject([
			{ code: "extension_acquisition_npm_install_failed", spec: "npm:bad" },
		]);
		expect(gateway.ensuredProjects).toEqual([
			"/repo/.ns/managed-extensions/npm/good",
			"/repo/.ns/managed-extensions/npm/bad",
		]);
		expect(gateway.installs.map(({ projectDir }) => projectDir)).toEqual([
			"/repo/.ns/managed-extensions/npm/good",
			"/repo/.ns/managed-extensions/npm/bad",
		]);
		expect(gateway.installed).toContain(npmPackageRoot("/repo", "good"));
	});

	test("fake state and logs are ownership-safe copies", async () => {
		const packageRoot = npmPackageRoot("/repo", "left-pad");
		const gateway = new FakeExtensionAcquisitionGateway({ installedPackageRoots: [packageRoot] });
		await gateway.installNpmPackage({
			projectDir: "/repo/.ns/managed-extensions/npm/other",
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
