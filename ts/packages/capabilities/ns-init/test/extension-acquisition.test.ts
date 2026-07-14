import { describe, expect, test } from "vitest";

import { managedNpmProjectRoot, npmPackageRoot } from "@nseng-ai/sdk/extensions/acquisition";
import { FakeExtensionAcquisitionGateway } from "@nseng-ai/sdk/testing";

import {
	InMemoryExtensionUninstallAcquisitionGateway,
	InMemoryExtensionUpdateAcquisitionGateway,
	RealExtensionInstallAcquisitionGateway,
	RealExtensionUninstallAcquisitionGateway,
	RealExtensionUpdateAcquisitionGateway,
	type PreviewExtensionUpdateSourceResult,
	type ReconcileExtensionUpdateSourceResult,
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

		expect(result).toEqual({
			ok: true,
			sourceKind: "npm",
			moduleRoot: packageRoot,
			outcome: "unchanged",
		});
		expect(acquisition.installs).toEqual([]);
	});

	test.each([
		{
			label: "local preview",
			sourceSpec: "./extensions/tools",
			installed: false,
			expected: {
				type: "preview-existing",
				sourceKind: "local",
				moduleRoot: "/repo/extensions/tools",
				intent: "local-in-place",
			} satisfies PreviewExtensionUpdateSourceResult,
		},
		{
			label: "present pinned preview",
			sourceSpec: "npm:@acme/tools@1.0.0",
			installed: true,
			expected: {
				type: "preview-existing",
				sourceKind: "npm",
				moduleRoot: npmPackageRoot("/repo", "@acme/tools"),
				intent: "ensure-pinned",
			} satisfies PreviewExtensionUpdateSourceResult,
		},
		{
			label: "missing pinned preview",
			sourceSpec: "npm:@acme/tools@1.0.0",
			installed: false,
			expected: {
				type: "preview-apply-required",
				sourceKind: "npm",
				intent: "ensure-pinned",
			} satisfies PreviewExtensionUpdateSourceResult,
		},
		{
			label: "present floating preview",
			sourceSpec: "npm:@acme/tools",
			installed: true,
			expected: {
				type: "preview-apply-required",
				sourceKind: "npm",
				intent: "refresh-floating",
			} satisfies PreviewExtensionUpdateSourceResult,
		},
	])("translates $label to an honest update state", async ({ sourceSpec, installed, expected }) => {
		const packageRoot = npmPackageRoot("/repo", "@acme/tools");
		const acquisition = new FakeExtensionAcquisitionGateway({
			installedPackageRoots: installed ? [packageRoot] : [],
		});
		const gateway = new RealExtensionUpdateAcquisitionGateway(acquisition);
		await expect(gateway.preview({ repoRoot: "/repo", sourceSpec })).resolves.toEqual(expected);
	});

	const packageRoot = npmPackageRoot("/repo", "@acme/tools");
	test.each([
		{
			sourceSpec: "npm:@acme/tools",
			installed: true,
			expected: {
				type: "applied",
				sourceKind: "npm",
				moduleRoot: packageRoot,
				intent: "refresh-floating",
				outcome: "refreshed",
			} satisfies ReconcileExtensionUpdateSourceResult,
		},
		{
			sourceSpec: "npm:@acme/tools",
			installed: false,
			expected: {
				type: "applied",
				sourceKind: "npm",
				moduleRoot: packageRoot,
				intent: "refresh-floating",
				outcome: "restored",
			} satisfies ReconcileExtensionUpdateSourceResult,
		},
		{
			sourceSpec: "npm:@acme/tools@1.0.0",
			installed: true,
			expected: {
				type: "applied",
				sourceKind: "npm",
				moduleRoot: packageRoot,
				intent: "ensure-pinned",
				outcome: "unchanged",
			} satisfies ReconcileExtensionUpdateSourceResult,
		},
		{
			sourceSpec: "npm:@acme/tools@1.0.0",
			installed: false,
			expected: {
				type: "applied",
				sourceKind: "npm",
				moduleRoot: packageRoot,
				intent: "ensure-pinned",
				outcome: "restored",
			} satisfies ReconcileExtensionUpdateSourceResult,
		},
	])(
		"derives applied outcome for $sourceSpec with prior existence $installed",
		async ({ sourceSpec, installed, expected }) => {
			const acquisition = new FakeExtensionAcquisitionGateway({
				installedPackageRoots: installed ? [packageRoot] : [],
			});
			const gateway = new RealExtensionUpdateAcquisitionGateway(acquisition);
			await expect(gateway.reconcile({ repoRoot: "/repo", sourceSpec })).resolves.toEqual(expected);
		},
	);

	test("maps real inspection errors to update failure", async () => {
		const packageRoot = npmPackageRoot("/repo", "@acme/tools");
		const gateway = new RealExtensionUpdateAcquisitionGateway(
			new FakeExtensionAcquisitionGateway({ failInspectPackageRoots: [packageRoot] }),
		);
		await expect(
			gateway.preview({ repoRoot: "/repo", sourceSpec: "npm:@acme/tools" }),
		).resolves.toMatchObject({
			type: "failed",
			diagnostics: [{ code: "extension_acquisition_npm_project_failed" }],
		});
	});

	test("update fake copies state and models semantic transitions", async () => {
		const packageRoot = npmPackageRoot("/repo", "@acme/tools");
		const roots = [packageRoot];
		const gateway = new InMemoryExtensionUpdateAcquisitionGateway({ installedPackageRoots: roots });
		roots.length = 0;
		await expect(
			gateway.reconcile({ repoRoot: "/repo", sourceSpec: "npm:@acme/tools" }),
		).resolves.toMatchObject({ type: "applied", outcome: "refreshed" });
		expect(gateway.installedRoots()).toEqual(new Set([packageRoot]));
		expect(gateway.operations()).toEqual([
			{
				operation: "reconcile",
				params: { repoRoot: "/repo", sourceSpec: "npm:@acme/tools" },
			},
		]);
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
