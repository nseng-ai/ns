import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@sdl/pi/parity/check";
import { grillUiParity, registerGrillUiExtension } from "../src/extension.ts";

interface RegisteredToolLike {
	readonly name?: unknown;
}

class FakePiSurfaceHost {
	private readonly registeredSurfaces: LivePiSurface[] = [];
	private readonly surfaceKeys = new Set<string>();

	registerCommand(name: string, _options: unknown): void {
		this.recordSurface({ kind: "command", surface: name });
	}

	registerTool(definition: RegisteredToolLike): void {
		if (typeof definition.name !== "string" || definition.name.length === 0) {
			throw new Error("registered tool definition is missing a non-empty name");
		}
		this.recordSurface({ kind: "tool", surface: definition.name });
	}

	sendUserMessage(): void {}

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

async function collectGrillSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, registerGrillUiExtension);
	return pi.surfaces();
}

async function registerWithFakeHost<TPi>(
	pi: FakePiSurfaceHost,
	register: (pi: TPi) => void | Promise<void>,
): Promise<void> {
	await register(pi as TPi);
}

describe("grill Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectGrillSurfaces(),
			metadata: grillUiParity,
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
});
