import { describe, expect, test } from "vitest";

import { managedNpmProjectRoot, npmPackageRoot } from "@nseng-ai/kernel/extensions/acquisition";
import { FakeExtensionAcquisitionGateway } from "@nseng-ai/kernel/testing";

import {
	InMemoryExtensionUninstallAcquisitionGateway,
	RealExtensionInstallAcquisitionGateway,
	RealExtensionUninstallAcquisitionGateway,
} from "../src/extension-acquisition.ts";

describe("extension install acquisition", () => {
	test("ensure does not refresh an installed floating npm source", async () => {
		const packageRoot = npmPackageRoot("/repo", "@acme/tools");
		const acquisition = new FakeExtensionAcquisitionGateway({
			installedPackageRoots: [packageRoot],
		});
		const gateway = new RealExtensionInstallAcquisitionGateway(acquisition);

		const result = await gateway.ensure({
			repoRoot: "/repo",
			sourceSpec: "npm:@acme/tools",
		});

		expect(result).toEqual({ ok: true, sourceKind: "npm", moduleRoot: packageRoot });
		expect(acquisition.installs).toEqual([]);
	});

	test("uninstall wrapper delegates only managed npm cleanup", async () => {
		const packageRoot = npmPackageRoot("/repo", "@acme/tools");
		const acquisition = new FakeExtensionAcquisitionGateway({
			installedPackageRoots: [packageRoot],
		});
		const gateway = new RealExtensionUninstallAcquisitionGateway(acquisition);

		await expect(
			gateway.removeManagedNpmPackage({ repoRoot: "/repo", packageName: "@acme/tools" }),
		).resolves.toEqual({
			ok: true,
			value: {
				status: "removed",
				path: managedNpmProjectRoot("/repo", "@acme/tools"),
			},
		});
		expect(acquisition.removals).toEqual([{ projectRoot: "/repo", packageName: "@acme/tools" }]);
	});

	test("uninstall fake models package state, failures, and read-only logs", async () => {
		const gateway = new InMemoryExtensionUninstallAcquisitionGateway({
			installedPackageNames: ["present"],
			failureByPackageName: {
				broken: {
					code: "extension_acquisition_npm_remove_failed",
					message: "busy",
				},
			},
		});
		await expect(
			gateway.removeManagedNpmPackage({ repoRoot: "/repo", packageName: "present" }),
		).resolves.toMatchObject({ ok: true, value: { status: "removed" } });
		await expect(
			gateway.removeManagedNpmPackage({ repoRoot: "/repo", packageName: "missing" }),
		).resolves.toMatchObject({ ok: true, value: { status: "already-absent" } });
		await expect(
			gateway.removeManagedNpmPackage({ repoRoot: "/repo", packageName: "broken" }),
		).resolves.toMatchObject({ ok: false, error: { message: "busy" } });
		expect(gateway.installedPackages()).toEqual(new Set());
		expect(gateway.removals()).toEqual([
			{ repoRoot: "/repo", packageName: "present" },
			{ repoRoot: "/repo", packageName: "missing" },
			{ repoRoot: "/repo", packageName: "broken" },
		]);
	});
});
