import { join } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type { HarnessArtifactKind } from "./artifact-catalog.ts";

export type HarnessScope = "project" | "user";

export interface HarnessPathEnvironment {
	readonly CLAUDE_CONFIG_DIR?: string;
}

export interface HarnessPathContext {
	projectRoot: string;
	homeDir: string;
	env?: HarnessPathEnvironment;
}

export interface HarnessSpecData {
	id: string;
	aliases: readonly string[];
	skillRoots: HarnessScopedPathSpec;
}

export interface HarnessScopedPathSpec {
	project: HarnessBasePathSpec;
	user: HarnessBasePathSpec;
}

export type HarnessBasePathSpec =
	| { type: "project"; relativePath: string }
	| { type: "home"; relativePath: string }
	| { type: "env-or-home"; envName: keyof HarnessPathEnvironment; homeRelativePath: string };

export interface ResolvedHarnessArtifactPath {
	harness: HarnessId;
	scope: HarnessScope;
	kind: "skill";
	rootPath: string;
	artifactPath: string;
}

export type HarnessPathErrorInfo =
	| { code: "unknown_harness"; message: string; details: { input: string } }
	| {
			code: "unsupported_artifact_kind";
			message: string;
			details: { harness: HarnessId; kind: HarnessArtifactKind };
	  };

export const HARNESS_SPECS = [
	{
		id: "claude-code",
		aliases: ["claude"],
		skillRoots: {
			project: { type: "project", relativePath: ".claude/skills" },
			user: {
				type: "env-or-home",
				envName: "CLAUDE_CONFIG_DIR",
				homeRelativePath: ".claude/skills",
			},
		},
	},
	{
		id: "codex",
		aliases: [],
		skillRoots: {
			project: { type: "project", relativePath: ".agents/skills" },
			user: { type: "home", relativePath: ".agents/skills" },
		},
	},
	{
		id: "pi",
		aliases: ["pi-dev"],
		skillRoots: {
			project: { type: "project", relativePath: ".pi/skills" },
			user: { type: "home", relativePath: ".pi/agent/skills" },
		},
	},
] as const satisfies readonly HarnessSpecData[];

export type HarnessId = (typeof HARNESS_SPECS)[number]["id"];
export type HarnessSpec = (typeof HARNESS_SPECS)[number];

const HARNESS_SPEC_BY_ID: ReadonlyMap<HarnessId, HarnessSpec> = new Map(
	HARNESS_SPECS.map((spec) => [spec.id, spec]),
);

export const ALL_HARNESS_IDS: readonly HarnessId[] = HARNESS_SPECS.map((spec) => spec.id);

export function normalizeHarnessId(input: string): Result<HarnessId, HarnessPathErrorInfo> {
	const normalized = input.trim().toLowerCase();
	for (const spec of HARNESS_SPECS) {
		const aliases: readonly string[] = spec.aliases;
		if (spec.id === normalized || aliases.includes(normalized)) return resultOk(spec.id);
	}
	return resultErr({
		code: "unknown_harness",
		message: `Unknown harness ${JSON.stringify(input)}. Supported harnesses: ${ALL_HARNESS_IDS.join(", ")}.`,
		details: { input },
	});
}

export function resolveHarnessSpec(input: string): Result<HarnessSpec, HarnessPathErrorInfo> {
	const harness = normalizeHarnessId(input);
	if (!harness.ok) return harness;
	return resultOk(HARNESS_SPEC_BY_ID.get(harness.value)!);
}

export function resolveHarnessArtifactPath(input: {
	harness: string;
	scope: HarnessScope;
	kind: HarnessArtifactKind;
	artifactName: string;
	context: HarnessPathContext;
}): Result<ResolvedHarnessArtifactPath, HarnessPathErrorInfo> {
	const spec = resolveHarnessSpec(input.harness);
	if (!spec.ok) return spec;
	if (input.kind !== "skill") {
		return resultErr({
			code: "unsupported_artifact_kind",
			message: `${spec.value.id} does not support provisioning ${input.kind} artifacts in the steelthread path table yet.`,
			details: { harness: spec.value.id, kind: input.kind },
		});
	}
	const rootPath = resolveBasePath(spec.value.skillRoots[input.scope], input.context);
	return resultOk({
		harness: spec.value.id,
		scope: input.scope,
		kind: "skill",
		rootPath,
		artifactPath: join(rootPath, input.artifactName),
	});
}

function resolveBasePath(spec: HarnessBasePathSpec, context: HarnessPathContext): string {
	switch (spec.type) {
		case "project":
			return join(context.projectRoot, spec.relativePath);
		case "home":
			return join(context.homeDir, spec.relativePath);
		case "env-or-home": {
			const configured = context.env?.[spec.envName];
			if (configured !== undefined && configured.trim() !== "") return join(configured, "skills");
			return join(context.homeDir, spec.homeRelativePath);
		}
	}
}
