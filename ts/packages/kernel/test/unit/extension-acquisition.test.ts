import { describe, expect, test } from "vitest";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import {
	npmPackageRoot,
	parseExtensionSourceSpec,
	resolveDeclaredExtensionModules,
	type ExtensionAcquisitionDiagnostic,
	type ExtensionAcquisitionGateway,
} from "../../src/extensions/acquisition.ts";

class FakeAcquisitionGateway implements ExtensionAcquisitionGateway {
	readonly installed = new Set<string>();
	readonly installs: Array<{
		rawSpec: string;
		packageName: string;
		version: string | undefined;
		pinned: boolean;
	}> = [];
	ensureCalls = 0;
	failSpec: string | undefined;

	async ensureManagedNpmProject(): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.ensureCalls += 1;
		return resultOk(undefined);
	}

	async isNpmPackageInstalled(
		packageRoot: string,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
		return resultOk(this.installed.has(packageRoot));
	}

	async installNpmPackage(request: {
		projectDir: string;
		rawSpec: string;
		packageName: string;
		version: string | undefined;
		pinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		this.installs.push({
			rawSpec: request.rawSpec,
			packageName: request.packageName,
			version: request.version,
			pinned: request.pinned,
		});
		if (request.rawSpec === this.failSpec) {
			return resultErr({
				code: "extension_acquisition_npm_install_failed",
				message: `failed ${request.rawSpec}`,
				spec: request.rawSpec,
			});
		}
		this.installed.add(npmPackageRoot("/repo", request.packageName));
		return resultOk(undefined);
	}
}

describe("extension acquisition", () => {
	test("parses npm specs without splitting scoped package names at the leading @", () => {
		expect(parseExtensionSourceSpec("/repo", "npm:left-pad")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "left-pad", version: undefined, pinned: false },
		});
		expect(parseExtensionSourceSpec("/repo", "npm:left-pad@1.3.0")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "left-pad", version: "1.3.0", pinned: true },
		});
		expect(parseExtensionSourceSpec("/repo", "npm:@scope/pkg")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "@scope/pkg", version: undefined, pinned: false },
		});
		expect(parseExtensionSourceSpec("/repo", "npm:@scope/pkg@1.2.3")).toMatchObject({
			ok: true,
			value: { kind: "npm", packageName: "@scope/pkg", version: "1.2.3", pinned: true },
		});
	});

	test("reports malformed npm specs and reserved git specs as per-spec diagnostics", async () => {
		expect(parseExtensionSourceSpec("/repo", "npm:")).toMatchObject({
			ok: false,
			error: { code: "extension_acquisition_invalid_npm_spec" },
		});
		const gateway = new FakeAcquisitionGateway();
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

	test("pinned npm installs when missing and skips when already installed", async () => {
		const gateway = new FakeAcquisitionGateway();
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
				pinned: true,
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

	test("unpinned npm installs on every apply run", async () => {
		const gateway = new FakeAcquisitionGateway();
		await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:left-pad"],
			mode: "apply",
			gateway,
		});
		await resolveDeclaredExtensionModules({
			projectRoot: "/repo",
			declaredSpecs: ["npm:left-pad"],
			mode: "apply",
			gateway,
		});
		expect(gateway.installs.map((install) => install.rawSpec)).toEqual([
			"npm:left-pad",
			"npm:left-pad",
		]);
	});

	test("one npm acquisition failure does not prevent another spec from resolving", async () => {
		const gateway = new FakeAcquisitionGateway();
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

	test("preview mode does not call mutating gateway methods", async () => {
		const gateway = new FakeAcquisitionGateway();
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
