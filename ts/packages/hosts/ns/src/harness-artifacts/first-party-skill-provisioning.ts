import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	findFirstPartySkillArtifact,
	listFirstPartySkillArtifacts,
} from "./first-party-catalog.ts";
import type { HarnessPathContext, HarnessPathEnvironment, HarnessScope } from "./harness-paths.ts";
import {
	applyPreparedProvision,
	prepareProvision,
	previewFromPrepared,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessArtifactProvisionPreview,
} from "./provision-apply.ts";

export const FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION = "static-catalog-v1";
export const FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE =
	"Could not locate the first-party ns skill catalog source root for provisioning.";

export function resolveFirstPartyCatalogSourceRoot(): string | undefined {
	let current = dirname(fileURLToPath(import.meta.url));
	const sentinelPath = firstPartyCatalogSentinelPath();
	if (sentinelPath === undefined) return undefined;
	for (let index = 0; index < 12; index += 1) {
		if (existsSync(join(current, sentinelPath))) return current;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return undefined;
}

export interface ProvisionFirstPartySkillRequest {
	skill: string;
	harness: string;
	scope: HarnessScope;
	projectRoot: string;
	homeDir?: string;
	env: Record<string, string | undefined>;
	isDryRun: boolean;
	shouldForce: boolean;
	/** Test seam: overrides the resolved first-party catalog source root. */
	sourceRoot?: string;
	/** Test seam: overrides the first-party catalog source version. */
	sourceVersion?: string;
	fs?: HarnessArtifactFileSystemGateway;
}

export type ProvisionFirstPartySkillOutcome =
	| (HarnessArtifactProvisionPreview & {
			type: "provisioned";
			mode: "dry-run" | "applied";
			writtenFiles: readonly string[];
	  })
	| (HarnessArtifactProvisionPreview & {
			type: "conflicted";
			conflictingFiles: readonly string[];
	  })
	| { type: "unknown-skill"; skill: string }
	| { type: "catalog-source-unavailable"; message: string }
	| { type: "error"; error: HarnessArtifactProvisionErrorInfo };

/**
 * Canonical core sentence for a provision conflict. Adapters add their own
 * surface framing (CLI remedies, ns-init materialization context) around it.
 */
export function describeProvisionConflict(conflictingFiles: readonly string[]): string {
	return `${conflictingFiles.length} locally edited target file(s)`;
}

export type ProvisionFirstPartySkillFailure =
	| { code: "catalog-source-unavailable"; message: string }
	| { code: "unknown-skill"; skill: string }
	| { code: "provision-error"; error: HarnessArtifactProvisionErrorInfo }
	| {
			code: "conflicted";
			message: string;
			manifestPath: string;
			conflictingFiles: readonly string[];
	  };

export type SplitProvisionFirstPartySkillOutcome =
	| { type: "success"; outcome: Extract<ProvisionFirstPartySkillOutcome, { type: "provisioned" }> }
	| { type: "failure"; failure: ProvisionFirstPartySkillFailure };

/**
 * Splits a provisioning outcome into success vs failure so thin adapters can
 * do one two-way branch and then map stable failure facts onto their own
 * surface (exit codes, remedies, per-harness framing). The failure facts never
 * learn CLI flags or adapter phrasing.
 */
export function splitProvisionFirstPartySkillOutcome(
	outcome: ProvisionFirstPartySkillOutcome,
): SplitProvisionFirstPartySkillOutcome {
	switch (outcome.type) {
		case "provisioned":
			return { type: "success", outcome };
		case "catalog-source-unavailable":
			return {
				type: "failure",
				failure: { code: "catalog-source-unavailable", message: outcome.message },
			};
		case "unknown-skill":
			return {
				type: "failure",
				failure: { code: "unknown-skill", skill: outcome.skill },
			};
		case "error":
			return {
				type: "failure",
				failure: { code: "provision-error", error: outcome.error },
			};
		case "conflicted":
			return {
				type: "failure",
				failure: {
					code: "conflicted",
					message: describeProvisionConflict(outcome.conflictingFiles),
					manifestPath: outcome.manifestPath,
					conflictingFiles: outcome.conflictingFiles,
				},
			};
	}
}

/**
 * Deep first-party skill provisioning operation: resolves the catalog source
 * root, looks up the skill, prepares the provision once, and either previews
 * (dry run) or applies it. Thin adapters (`ns skills install`) map these
 * outcomes onto their own surfaces.
 */
export async function provisionFirstPartySkill(
	request: ProvisionFirstPartySkillRequest,
): Promise<ProvisionFirstPartySkillOutcome> {
	const sourceRoot = request.sourceRoot ?? resolveFirstPartyCatalogSourceRoot();
	if (sourceRoot === undefined) {
		return {
			type: "catalog-source-unavailable",
			message: FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
		};
	}
	const artifact = findFirstPartySkillArtifact(request.skill);
	if (artifact === undefined) return { type: "unknown-skill", skill: request.skill };
	const prepared = await prepareProvision({
		artifact,
		harness: request.harness,
		scope: request.scope,
		context: firstPartySkillProvisionPathContext({
			projectRoot: request.projectRoot,
			...optionalEntry("homeDir", request.homeDir),
			env: request.env,
		}),
		sourceRoot,
		sourceVersion: request.sourceVersion ?? FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
		...optionalEntry("fs", request.fs),
	});
	if (!prepared.ok) return { type: "error", error: prepared.error };
	if (request.isDryRun) {
		return {
			type: "provisioned",
			mode: "dry-run",
			...previewFromPrepared(prepared.value),
			writtenFiles: [],
		};
	}
	const applied = await applyPreparedProvision(prepared.value, {
		shouldForce: request.shouldForce,
	});
	if (!applied.ok) return { type: "error", error: applied.error };
	if (applied.value.outcome === "conflicted") {
		return {
			type: "conflicted",
			...previewFromPrepared(prepared.value),
			conflictingFiles: applied.value.conflictingFiles,
		};
	}
	return {
		type: "provisioned",
		mode: "applied",
		...previewFromPrepared(prepared.value),
		writtenFiles: applied.value.writtenFiles,
	};
}

export function firstPartySkillProvisionPathContext(input: {
	projectRoot: string;
	homeDir?: string;
	env: Record<string, string | undefined>;
}): HarnessPathContext {
	return {
		projectRoot: input.projectRoot,
		...optionalEntry("homeDir", input.homeDir),
		...optionalEntry("env", harnessPathEnvironment(input.env)),
	};
}

function firstPartyCatalogSentinelPath(): string | undefined {
	const artifact = listFirstPartySkillArtifacts()[0];
	if (artifact === undefined) return undefined;
	return join(artifact.source.relativePath, "SKILL.md");
}

function harnessPathEnvironment(
	env: Record<string, string | undefined>,
): HarnessPathEnvironment | undefined {
	const claudeConfigDir = env.CLAUDE_CONFIG_DIR;
	if (claudeConfigDir === undefined) return undefined;
	return { CLAUDE_CONFIG_DIR: claudeConfigDir };
}
