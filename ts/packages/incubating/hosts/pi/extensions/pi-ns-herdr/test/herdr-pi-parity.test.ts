import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";
import type {
	HandoffExtensionAPI,
	HandoffPromptCreateIntegration,
} from "@nseng-ai/pi-ns-handoffs/handoff-launch";
import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi-runtime/parity/check";
import { herdrParity, registerHerdrPiExtension } from "../src/pi/extension.ts";

function baseHost(surfaces: LivePiSurface[]): ExtensionAPI {
	return {
		registerCommand(name) {
			surfaces.push({ kind: "command", surface: name });
		},
		appendEntry() {},
		registerEntryRenderer() {},
		on() {},
		exec: async () => ({ code: 0, stdout: "main\n", stderr: "", killed: false }),
		getCommands: () => [],
		getThinkingLevel: () => "off",
		setThinkingLevel() {},
		setModel: async () => false,
		sendUserMessage() {},
	};
}

function handoffHost(surfaces: LivePiSurface[]): HandoffExtensionAPI {
	return {
		registerCommand(name) {
			surfaces.push({ kind: "command", surface: name });
		},
		appendEntry() {},
		registerEntryRenderer() {},
		registerTool() {},
		on() {},
		exec: async () => ({ code: 0, stdout: "main\n", stderr: "", killed: false }),
		getCommands: () => [],
		getAllTools: () => [],
		getThinkingLevel: () => "off",
		sendUserMessage() {},
	};
}

function fakeHandoffIntegration(): HandoffPromptCreateIntegration {
	return {
		async runCreateCommand() {},
	};
}

async function collectBaseHerdrPiSurfaces(): Promise<LivePiSurface[]> {
	const surfaces: LivePiSurface[] = [];
	await registerHerdrPiExtension(baseHost(surfaces));
	return surfaces;
}

async function collectHandoffHerdrPiSurfaces(): Promise<LivePiSurface[]> {
	const surfaces: LivePiSurface[] = [];
	const host = handoffHost(surfaces);
	await registerHerdrPiExtension(host, {
		loadHandoffIntegration: async () => ({
			createHandoffLaunchIntegration: () => fakeHandoffIntegration(),
		}),
	});
	return surfaces;
}

function expectParity(liveSurfaces: LivePiSurface[], metadata: typeof herdrParity): void {
	const comparison = comparePiSurfaceParity({ liveSurfaces, metadata });
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
}

describe("Herdr Pi extension parity metadata", () => {
	test("base registrations match the non-optional package metadata", async () => {
		expectParity(
			await collectBaseHerdrPiSurfaces(),
			herdrParity.filter((entry) => entry.surface !== "ns:herdr:tab:handoff"),
		);
	});

	test("Handoffs-enabled registrations match all 12 metadata entries", async () => {
		expectParity(await collectHandoffHerdrPiSurfaces(), herdrParity);
	});
});
