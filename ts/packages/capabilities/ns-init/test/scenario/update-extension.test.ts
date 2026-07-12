import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";
import { npmPackageRoot } from "@nseng-ai/kernel/extensions/acquisition";
import { FakeExtensionAcquisitionGateway } from "@nseng-ai/kernel/testing";

import { RealExtensionUpdateAcquisitionGateway } from "../../src/extension-acquisition.ts";

import type { ExtensionUpdateContext } from "../../src/update-extension.ts";
import { updateExtension } from "../../src/update-extension.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryArtifactActivationGateway,
	InMemoryDeclaredExtensionsGateway,
	InMemoryExtensionUpdateAcquisitionGateway,
} from "../../src/testing/index.ts";

function descriptor(source: string): DeclaredExtensionDescriptor {
	const isNpm = source.startsWith("npm:");
	const moduleRoot = isNpm ? npmPackageRoot("/repo", "@test/tools") : resolve("/repo", source);
	return {
		spec: source,
		sourceKind: isNpm ? "npm" : "local",
		moduleRoot,
		descriptorPath: `${moduleRoot}/extension.ts`,
		packageName: "@test/tools",
		version: "1.0.0",
		descriptor: { description: "tools", activation: { instructions: "## Tools\n" } },
	};
}

function fixture(options: {
	source: string;
	installed?: boolean;
	acquisition?: InMemoryExtensionUpdateAcquisitionGateway;
	descriptors?: readonly DeclaredExtensionDescriptor[];
	diagnostics?: readonly { severity: "error"; code: string; message: string; spec: string }[];
	artifacts?: InMemoryArtifactActivationGateway;
}): {
	context: ExtensionUpdateContext;
	acquisition: InMemoryExtensionUpdateAcquisitionGateway;
	declaredExtensions: InMemoryDeclaredExtensionsGateway;
	artifacts: InMemoryArtifactActivationGateway;
} {
	const packageRoot = npmPackageRoot("/repo", "@test/tools");
	const acquisition =
		options.acquisition ??
		new InMemoryExtensionUpdateAcquisitionGateway({
			installedPackageRoots: options.installed ? [packageRoot] : [],
		});
	const declaredExtensions = new InMemoryDeclaredExtensionsGateway({
		result: {
			descriptors: options.descriptors ?? [descriptor(options.source)],
			diagnostics: options.diagnostics ?? [],
		},
	});
	const artifacts = options.artifacts ?? new InMemoryArtifactActivationGateway();
	return {
		acquisition,
		declaredExtensions,
		artifacts,
		context: {
			git: new InMemoryGitGateway({ optionalRepoRoot: "/repo", trunkBranch: "main" }),
			files: new InMemoryActivationFilesGateway({
				files: {
					"ns.toml": `harnesses = ["pi"]\nextensions = ["${options.source}"]\n`,
				},
			}),
			declaredExtensions,
			artifacts,
			updateAcquisition: acquisition,
		},
	};
}

describe("updateExtension acquisition scenarios", () => {
	it.each([
		{
			label: "local preview",
			source: "./extensions/tools",
			installed: false,
			dryRun: true,
			intent: "local-in-place",
			outcome: "planned",
			effects: "available",
		},
		{
			label: "local apply",
			source: "./extensions/tools",
			installed: false,
			dryRun: false,
			intent: "local-in-place",
			outcome: "not-applicable",
			effects: "available",
		},
		{
			label: "present pinned preview",
			source: "npm:@test/tools@1.0.0",
			installed: true,
			dryRun: true,
			intent: "ensure-pinned",
			outcome: "planned",
			effects: "available",
		},
		{
			label: "present pinned apply",
			source: "npm:@test/tools@1.0.0",
			installed: true,
			dryRun: false,
			intent: "ensure-pinned",
			outcome: "unchanged",
			effects: "available",
		},
		{
			label: "missing pinned preview",
			source: "npm:@test/tools@1.0.0",
			installed: false,
			dryRun: true,
			intent: "ensure-pinned",
			outcome: "planned",
			effects: "unavailable",
		},
		{
			label: "missing pinned apply",
			source: "npm:@test/tools@1.0.0",
			installed: false,
			dryRun: false,
			intent: "ensure-pinned",
			outcome: "restored",
			effects: "available",
		},
		{
			label: "present floating preview",
			source: "npm:@test/tools",
			installed: true,
			dryRun: true,
			intent: "refresh-floating",
			outcome: "planned",
			effects: "unavailable",
		},
		{
			label: "present floating apply",
			source: "npm:@test/tools",
			installed: true,
			dryRun: false,
			intent: "refresh-floating",
			outcome: "refreshed",
			effects: "available",
		},
		{
			label: "missing floating preview",
			source: "npm:@test/tools",
			installed: false,
			dryRun: true,
			intent: "refresh-floating",
			outcome: "planned",
			effects: "unavailable",
		},
		{
			label: "missing floating apply",
			source: "npm:@test/tools",
			installed: false,
			dryRun: false,
			intent: "refresh-floating",
			outcome: "restored",
			effects: "available",
		},
	])("reports $label", async ({ source, installed, dryRun, intent, outcome, effects }) => {
		const { context, acquisition, artifacts } = fixture({ source, installed });

		const result = await updateExtension(context, { cwd: "/repo", source, dryRun });

		expect(result).toMatchObject({
			type: "ok",
			data: {
				mode: dryRun ? "dry-run" : "applied",
				acquisitionIntent: intent,
				acquisitionOutcome: outcome,
				prospectiveEffects: effects,
			},
		});
		expect(acquisition.operations()).toEqual([
			{
				operation: dryRun ? "preview" : "reconcile",
				params: { repoRoot: "/repo", sourceSpec: source },
			},
		]);
		const shouldPreflight = !dryRun || effects === "available";
		expect(artifacts.prepareCalls()).toHaveLength(shouldPreflight ? 1 : 0);
		expect(artifacts.applyCalls()).toHaveLength(dryRun ? 0 : 1);
	});

	it("returns nonzero when real inspection semantics fail during dry-run", async () => {
		const source = "npm:@test/tools";
		const { context: baseContext } = fixture({ source });
		const context: ExtensionUpdateContext = {
			...baseContext,
			updateAcquisition: new RealExtensionUpdateAcquisitionGateway(
				new FakeExtensionAcquisitionGateway({
					failInspectPackageRoots: [npmPackageRoot("/repo", "@test/tools")],
				}),
			),
		};

		const result = await updateExtension(context, { cwd: "/repo", source, dryRun: true });

		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-update-acquisition-failed",
			data: {
				phase: "acquisition",
				diagnostics: [{ code: "extension-acquisition-npm-project-failed" }],
			},
		});
	});

	it("reports apply acquisition failure before activation", async () => {
		const source = "npm:@test/tools";
		const acquisition = new InMemoryExtensionUpdateAcquisitionGateway({
			reconcileFailureBySpec: {
				[source]: { code: "extension_acquisition_npm_install_failed", message: "registry down" },
			},
		});
		const { context, declaredExtensions } = fixture({ source, acquisition });

		const result = await updateExtension(context, { cwd: "/repo", source, dryRun: false });

		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-update-acquisition-failed",
		});
		expect(declaredExtensions.calls()).toEqual([]);
	});

	it("runs activation preflight and apply after successful acquisition", async () => {
		const source = "npm:@test/tools";
		const { context, declaredExtensions } = fixture({ source, installed: true });

		const result = await updateExtension(context, { cwd: "/repo", source, dryRun: false });

		expect(result).toMatchObject({ type: "ok", data: { acquisitionOutcome: "refreshed" } });
		expect(declaredExtensions.calls()).toEqual([{ repoRoot: "/repo", specs: [source] }]);
	});

	it("reports activation apply failure after successful acquisition", async () => {
		const source = "npm:@test/tools";
		const artifacts = new InMemoryArtifactActivationGateway({
			applyResult: {
				ok: false,
				error: {
					code: "stale_prepared_reconciliation",
					message: "target changed",
					details: { kind: "target", path: "/repo/.pi/skills/tools", installKey: "pi:tools" },
					completedTransitions: new Map(),
				},
				completed: [],
			},
		});
		const { context } = fixture({ source, installed: true, artifacts });

		const result = await updateExtension(context, { cwd: "/repo", source, dryRun: false });

		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-update-apply-failed",
			data: { phase: "artifacts" },
		});
	});

	it("records that live acquisition completed when activation preflight fails", async () => {
		const source = "npm:@test/tools";
		const { context } = fixture({
			source,
			installed: true,
			descriptors: [],
			diagnostics: [
				{ severity: "error", code: "descriptor-invalid", message: "bad", spec: source },
			],
		});

		const result = await updateExtension(context, { cwd: "/repo", source, dryRun: false });

		expect(result).toMatchObject({
			type: "failure",
			errorType: "ns-extension-update-preflight-failed",
			data: { sourceAcquisitionCompleted: true },
		});
	});
});
