import { join } from "node:path";

import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type { HarnessArtifactKind } from "./artifact-catalog.ts";

export const HARNESS_SCOPES = ["project", "user"] as const;

export type HarnessScope = (typeof HARNESS_SCOPES)[number];

export interface HarnessPathEnvironment {
	readonly CLAUDE_CONFIG_DIR?: string;
}

export interface HarnessPathContext {
	projectRoot: string;
	homeDir?: string;
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
	| {
			type: "env-or-home";
			envName: keyof HarnessPathEnvironment;
			homeRelativePath: string;
	  };

export interface ResolvedHarnessSkillRoot {
	harness: HarnessId;
	rootPath: string;
}

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
	  }
	| {
			code: "missing_home_directory";
			message: string;
			details: { harness: HarnessId; scope: "user" };
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
	const spec = HARNESS_SPEC_BY_ID.get(harness.value);
	if (spec === undefined) {
		throw new Error(
			`Harness spec missing for normalized harness ${JSON.stringify(harness.value)}.`,
		);
	}
	return resultOk(spec);
}

export function resolveHarnessSkillRoot(input: {
	harness: string;
	scope: HarnessScope;
	context: HarnessPathContext;
}): Result<ResolvedHarnessSkillRoot, HarnessPathErrorInfo> {
	const spec = resolveHarnessSpec(input.harness);
	if (!spec.ok) return spec;
	const basePathSpec = spec.value.skillRoots[input.scope];
	if (input.scope === "user" && needsHomeDirectory(basePathSpec, input.context)) {
		return resultErr({
			code: "missing_home_directory",
			message: `${spec.value.id} user-scope provisioning requires a user home in the harness path context. Set HOME for host CLI contexts or pass a domain context homeDir.`,
			details: { harness: spec.value.id, scope: "user" },
		});
	}
	return resultOk({
		harness: spec.value.id,
		rootPath: resolveBasePath(basePathSpec, input.context),
	});
}

export function resolveHarnessArtifactPath(input: {
	harness: string;
	scope: HarnessScope;
	kind: HarnessArtifactKind;
	artifactName: string;
	context: HarnessPathContext;
}): Result<ResolvedHarnessArtifactPath, HarnessPathErrorInfo> {
	const root = resolveHarnessSkillRoot(input);
	if (!root.ok) return root;
	if (input.kind !== "skill") {
		return resultErr({
			code: "unsupported_artifact_kind",
			message: `${root.value.harness} does not support provisioning ${input.kind} artifacts in the steelthread path table yet.`,
			details: { harness: root.value.harness, kind: input.kind },
		});
	}
	return resultOk({
		harness: root.value.harness,
		scope: input.scope,
		kind: "skill",
		rootPath: root.value.rootPath,
		artifactPath: join(root.value.rootPath, input.artifactName),
	});
}

function needsHomeDirectory(spec: HarnessBasePathSpec, context: HarnessPathContext): boolean {
	return spec.type !== "project" && resolvedUserScopeBasePath(spec, context) === undefined;
}

function resolveBasePath(spec: HarnessBasePathSpec, context: HarnessPathContext): string {
	switch (spec.type) {
		case "project":
			return join(context.projectRoot, spec.relativePath);
		case "home":
		case "env-or-home": {
			const basePath = resolvedUserScopeBasePath(spec, context);
			if (basePath === undefined) {
				throw new Error(
					"Harness user-scope path resolution reached home fallback without a home directory.",
				);
			}
			return basePath;
		}
	}
}

function resolvedUserScopeBasePath(
	spec: Exclude<HarnessBasePathSpec, { type: "project" }>,
	context: HarnessPathContext,
): string | undefined {
	if (spec.type === "env-or-home") {
		const configured = context.env?.[spec.envName];
		if (isPresent(configured)) return join(configured, "skills");
		return joinPresent(context.homeDir, spec.homeRelativePath);
	}
	return joinPresent(context.homeDir, spec.relativePath);
}

function joinPresent(basePath: string | undefined, relativePath: string): string | undefined {
	return isPresent(basePath) ? join(basePath, relativePath) : undefined;
}

function isPresent(value: string | undefined): value is string {
	return value !== undefined && value.trim() !== "";
}
