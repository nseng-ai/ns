import { describe, expect, test } from "vitest";

import registerBranchContextExtension from "../src/branch-context/extension.ts";
import claudeExtension from "../src/claude/extension.ts";
import codeWorkflowsExtension from "../src/flow/code-workflows.ts";
import codeExtension from "../src/pr/code-extension.ts";
import dispatchRunnerSubagentExtension from "../src/runner-subagents/dispatch-extension.ts";
import handoffExtension from "../src/handoff/extension.ts";
import investigateExtension from "../src/investigate/extension.ts";
import modelShortcutExtension from "../src/models/shortcuts.ts";
import objectiveExtension from "../src/objectives/extension.ts";
import prExtension from "../src/pr/extension.ts";
import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "../src/parity/check.ts";
import { loadPiExtensionParityRecords } from "../src/parity/registry.ts";
import { definePiSurfaceParity } from "../src/parity/extension.ts";
import type { PiAgentDefinition } from "../src/runtime/agent-definition.ts";
import sdlExtension from "../src/flow/sdl-extension.ts";
import thermoCouncilExtension from "../src/thermo-council/extension.ts";

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

async function collectLivePiExtensionSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();

	await registerWithFakeHost(pi, registerBranchContextWithFakeHostOptions);
	await registerWithFakeHost(pi, claudeExtension);
	await registerWithFakeHost(pi, codeWorkflowsExtension);
	await registerWithFakeHost(pi, codeExtension);
	await registerWithFakeHost(pi, registerDispatchRunnerSubagentWithFakeDefinition);
	await registerWithFakeHost(pi, handoffExtension);
	await registerWithFakeHost(pi, registerInvestigateWithFakeDefinition);
	await registerWithFakeHost(pi, modelShortcutExtension);
	await registerWithFakeHost(pi, objectiveExtension);
	await registerWithFakeHost(pi, prExtension);
	await registerWithFakeHost(pi, sdlExtension);
	await registerWithFakeHost(pi, thermoCouncilExtension);
	// The worktree-status implementation lives in @sdl/worktree-status and is
	// discovered through .pi/extensions/worktree-status.ts, but @sdl/pi owns the
	// static parity registry. Include its live command shape without importing the
	// package and creating a test-only cycle.
	pi.registerCommand("pi:worktree-status-refresh", {
		description: "Refresh the worktree status footer",
		handler() {},
	});

	return pi.surfaces();
}

async function registerWithFakeHost<TPi>(
	pi: FakePiSurfaceHost,
	register: (pi: TPi) => void | Promise<void>,
): Promise<void> {
	await register(pi as TPi);
}

function registerBranchContextWithFakeHostOptions(
	pi: Parameters<typeof registerBranchContextExtension>[0],
): void {
	registerBranchContextExtension(pi, { branchContextDefaultCreation: "graphite" });
}

function registerDispatchRunnerSubagentWithFakeDefinition(
	pi: Parameters<typeof dispatchRunnerSubagentExtension>[0],
): void {
	dispatchRunnerSubagentExtension(pi, { loadAgentDefinition: () => fakeRunnerAgentDefinition() });
}

function registerInvestigateWithFakeDefinition(
	pi: Parameters<typeof investigateExtension>[0],
): void {
	investigateExtension(pi, { loadAgentDefinition: () => fakeInvestigatorAgentDefinition() });
}

function fakeRunnerAgentDefinition(): PiAgentDefinition {
	return {
		schema: "sdl.pi-agent.v1",
		name: "runner",
		toolName: "dispatch_runner_subagent",
		label: "Dispatch Forked Pi Session",
		description: "Dispatch a focused runner subagent fixture.",
		promptGuidelines: [],
		body: "{{prompt}}",
		filePath: "/fixture/.sdl/pi/agents/runner.md",
	};
}

function fakeInvestigatorAgentDefinition(): PiAgentDefinition {
	return {
		schema: "sdl.pi-agent.v1",
		name: "investigator",
		toolName: "investigate",
		label: "Investigator",
		description: "Run a fixture investigation.",
		promptGuidelines: [],
		body: "Investigate this prompt:\n\n{{prompt}}",
		filePath: "/fixture/.sdl/pi/agents/investigator.md",
	};
}

describe("Pi extension parity metadata", () => {
	test("all @sdl/pi command surfaces have parity metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectLivePiExtensionSurfaces(),
			metadata: loadPiExtensionParityRecords(),
		});

		if (
			comparison.missingMetadata.length > 0 ||
			comparison.staleMetadata.length > 0 ||
			comparison.duplicateMetadataKeys.length > 0
		) {
			throw new Error(formatParityComparisonFailure(comparison));
		}

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
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

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
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
				sourcePackage: "@sdl/pi",
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
				sourcePackage: "@sdl/pi",
				sourceModule: "fixture",
				notes: "Fixture metadata for dynamic-family stale-check coverage.",
				matching: { type: "dynamic-family", rationale: "Generated only by runtime fixtures." },
			},
		] as const);

		const comparison = comparePiSurfaceParity({ liveSurfaces: [], metadata });

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
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
				sourcePackage: "@sdl/pi",
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
				sourcePackage: "@sdl/pi",
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
