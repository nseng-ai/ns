import { describe, expect, test } from "vitest";

import asdlDevExtension from "../src/asdl-dev-extension.ts";
import registerBranchContextExtension from "../src/branch-context-extension.ts";
import claudeExtension from "../src/claude.ts";
import codeWorkflowsExtension from "../src/code-workflows.ts";
import codeExtension from "../src/code.ts";
import { registerContextProfilerExtension } from "../src/context-profiler.ts";
import dispatchRunnerSubagentExtension from "../src/dispatch-runner-subagent.ts";
import { registerGrillUiExtension } from "../src/grill-ui.ts";
import handoffExtension from "../src/handoff.ts";
import modelShortcutExtension from "../src/model-shortcuts.ts";
import objectiveExtension from "../src/objective.ts";
import { comparePiSurfaceParity, formatParityComparisonFailure, type LivePiSurface } from "../src/parity-check.ts";
import { PI_EXTENSION_PARITY_RECORDS } from "../src/parity-registry.ts";
import { definePiSurfaceParity } from "../src/parity.ts";
import type { PiAgentDefinition } from "../src/pi-agent-definition.ts";
import sdlExtension from "../src/sdl-extension.ts";
import worktreeStatusExtension from "../src/worktree-status.ts";

interface RegisteredToolLike {
	readonly name?: unknown;
}

class FakePiSurfaceHost {
	private readonly registeredSurfaces: LivePiSurface[] = [];
	private readonly surfaceKeys = new Set<string>();
	readonly messageRenderers = new Map<string, unknown>();
	readonly events: string[] = [];

	registerCommand(name: string, _options: unknown): void {
		this.recordSurface({ kind: "command", surface: name });
	}

	registerTool(definition: RegisteredToolLike): void {
		if (typeof definition.name !== "string" || definition.name.length === 0) {
			throw new Error("registered tool definition is missing a non-empty name");
		}
		this.recordSurface({ kind: "tool", surface: definition.name });
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.messageRenderers.set(customType, renderer);
	}

	on(event: string, _handler: unknown): void {
		this.events.push(event);
	}

	async exec(): Promise<never> {
		throw new Error("unexpected exec during Pi extension registration");
	}

	getCommands(): readonly unknown[] {
		return [];
	}

	sendMessage(): void {}

	sendUserMessage(): void {}

	stop(): void {}

	async setModel(): Promise<boolean> {
		throw new Error("unexpected setModel during Pi extension registration");
	}

	getThinkingLevel(): "off" {
		return "off";
	}

	surfaces(): LivePiSurface[] {
		return [...this.registeredSurfaces];
	}

	private recordSurface(surface: LivePiSurface): void {
		const key = `${surface.kind}:${surface.surface}`;
		if (this.surfaceKeys.has(key)) {
			throw new Error(`duplicate ${surface.kind} registration: ${surface.surface}`);
		}
		this.surfaceKeys.add(key);
		this.registeredSurfaces.push(surface);
	}
}

function collectLivePiExtensionSurfaces(): LivePiSurface[] {
	const pi = new FakePiSurfaceHost();

	registerWithFakeHost(pi, asdlDevExtension);
	registerWithFakeHost(pi, registerBranchContextWithFakeHostOptions);
	registerWithFakeHost(pi, claudeExtension);
	registerWithFakeHost(pi, codeWorkflowsExtension);
	registerWithFakeHost(pi, codeExtension);
	registerWithFakeHost(pi, registerContextProfilerExtension);
	registerWithFakeHost(pi, registerDispatchRunnerSubagentWithFakeDefinition);
	registerWithFakeHost(pi, registerGrillUiExtension);
	registerWithFakeHost(pi, handoffExtension);
	registerWithFakeHost(pi, modelShortcutExtension);
	registerWithFakeHost(pi, objectiveExtension);
	registerWithFakeHost(pi, sdlExtension);
	registerWithFakeHost(pi, worktreeStatusExtension);

	return pi.surfaces();
}

function registerWithFakeHost<TPi>(pi: FakePiSurfaceHost, register: (pi: TPi) => void): void {
	register(pi as TPi);
}

function registerBranchContextWithFakeHostOptions(pi: Parameters<typeof registerBranchContextExtension>[0]): void {
	registerBranchContextExtension(pi, { branchContextDefaultCreation: "graphite" });
}

function registerDispatchRunnerSubagentWithFakeDefinition(pi: Parameters<typeof dispatchRunnerSubagentExtension>[0]): void {
	dispatchRunnerSubagentExtension(pi, { loadAgentDefinition: () => fakeRunnerAgentDefinition() });
}

function fakeRunnerAgentDefinition(): PiAgentDefinition {
	return {
		schema: "asdl.pi-agent.v1",
		name: "runner",
		toolName: "dispatch_runner_subagent",
		label: "Dispatch Runner Subagent",
		description: "Dispatch a focused runner subagent fixture.",
		promptGuidelines: [],
		body: "{{prompt}}",
		filePath: "/fixture/.asdl/pi/agents/runner.md",
	};
}

describe("Pi extension parity metadata", () => {
	test("all @asdl/pi-extensions command surfaces have parity metadata", () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: collectLivePiExtensionSurfaces(),
			metadata: PI_EXTENSION_PARITY_RECORDS,
		});

		if (
			comparison.missingMetadata.length > 0 ||
			comparison.staleMetadata.length > 0 ||
			comparison.duplicateMetadataKeys.length > 0
		) {
			throw new Error(formatParityComparisonFailure(comparison));
		}

		expect(comparison).toEqual({ missingMetadata: [], staleMetadata: [], duplicateMetadataKeys: [] });
	});

	test("comparison reports live command surfaces missing exact metadata", () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: [{ kind: "command", surface: "code:missing" }],
			metadata: [],
		});

		expect(comparison.missingMetadata).toEqual([{ kind: "command", surface: "code:missing" }]);
		expect(comparison.staleMetadata).toEqual([]);
	});

	test("comparison ignores live tool surfaces for missing metadata", () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: [{ kind: "tool", surface: "pi_native_tool" }],
			metadata: [],
		});

		expect(comparison).toEqual({ missingMetadata: [], staleMetadata: [], duplicateMetadataKeys: [] });
	});

	test("comparison reports stale exact metadata", () => {
		const metadata = definePiSurfaceParity([
			{
				kind: "command",
				surface: "fixture:stale",
				workflow: "Fixture stale command",
				parity: "WAIVED",
				fallback: "Use a fixture fallback.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@asdl/pi-extensions",
				sourceModule: "fixture",
				notes: "Fixture metadata for stale-check coverage.",
			},
		] as const);

		const comparison = comparePiSurfaceParity({ liveSurfaces: [], metadata });

		expect(comparison.missingMetadata).toEqual([]);
		expect(comparison.staleMetadata).toEqual(metadata);
	});

	test("comparison excludes dynamic-family metadata from stale checks", () => {
		const metadata = definePiSurfaceParity([
			{
				kind: "command",
				surface: "runtime-family:*",
				workflow: "Fixture runtime command family",
				parity: "WAIVED",
				fallback: "Use a fixture fallback.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@asdl/pi-extensions",
				sourceModule: "fixture",
				notes: "Fixture metadata for dynamic-family stale-check coverage.",
				matching: { type: "dynamic-family", rationale: "Generated only by runtime fixtures." },
			},
		] as const);

		const comparison = comparePiSurfaceParity({ liveSurfaces: [], metadata });

		expect(comparison).toEqual({ missingMetadata: [], staleMetadata: [], duplicateMetadataKeys: [] });
	});

	test("comparison reports duplicate exact metadata keys", () => {
		const metadata = definePiSurfaceParity([
			{
				kind: "command",
				surface: "code:duplicate",
				workflow: "Fixture duplicate command",
				parity: "NONE",
				trackedGap: "Fixture tracked gap.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@asdl/pi-extensions",
				sourceModule: "fixture-a",
				notes: "First fixture duplicate.",
			},
			{
				kind: "command",
				surface: "code:duplicate",
				workflow: "Fixture duplicate command",
				parity: "NONE",
				trackedGap: "Fixture tracked gap.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@asdl/pi-extensions",
				sourceModule: "fixture-b",
				notes: "Second fixture duplicate.",
			},
		] as const);

		const comparison = comparePiSurfaceParity({
			liveSurfaces: [{ kind: "command", surface: "code:duplicate" }],
			metadata,
		});

		expect(comparison.duplicateMetadataKeys).toEqual(["command:code:duplicate"]);
	});
});
