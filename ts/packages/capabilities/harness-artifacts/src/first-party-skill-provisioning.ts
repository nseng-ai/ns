import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { listFirstPartySkillArtifacts } from "./first-party-catalog.ts";
import type { HarnessPathContext, HarnessPathEnvironment } from "./harness-paths.ts";

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
