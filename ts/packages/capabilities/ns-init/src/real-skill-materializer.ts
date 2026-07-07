import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	applyHarnessArtifactProvision,
	findFirstPartySkillArtifact,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessPathEnvironment,
} from "@nseng-ai/harness-artifacts/api";

import type { NsInitErrorInfo } from "./error-info.ts";
import type {
	HarnessId,
	SkillMaterializeParams,
	SkillMaterializer,
	SkillMaterializeResult,
} from "./skill-materializer.ts";

export interface RealSkillMaterializerOptions {
	sourceRoot?: string;
	sourceVersion?: string;
	homeDir?: string;
	env?: Record<string, string | undefined>;
}

export class RealSkillMaterializer implements SkillMaterializer {
	private readonly sourceRoot: string | undefined;
	private readonly sourceVersion: string;
	private readonly homeDir: string;
	private readonly env: Record<string, string | undefined>;

	constructor(options: RealSkillMaterializerOptions = {}) {
		this.sourceRoot = options.sourceRoot ?? resolveFirstPartyCatalogSourceRoot();
		this.sourceVersion = options.sourceVersion ?? "static-catalog-v1";
		this.homeDir = options.homeDir ?? options.env?.HOME ?? "";
		this.env = { ...(options.env ?? {}) };
	}

	async materializeObjectiveSkills(
		params: SkillMaterializeParams,
	): Promise<SkillMaterializeResult> {
		if (this.sourceRoot === undefined) {
			return {
				type: "unavailable",
				reason: "Could not locate the first-party ns skill catalog source root for provisioning.",
			};
		}

		const artifact = findFirstPartySkillArtifact("objective");
		if (artifact === undefined) {
			return {
				type: "error",
				error: {
					code: "objective-skill-catalog-missing",
					message: "The first-party objective skill is missing from the harness artifact catalog.",
				},
			};
		}

		const installedSkillPaths: string[] = [];
		for (const harness of params.harnesses) {
			const applied = await applyHarnessArtifactProvision({
				artifact,
				harness,
				scope: "project",
				context: {
					projectRoot: params.repoRoot,
					homeDir: this.homeDir,
					...harnessPathEnvironment(this.env),
				},
				sourceRoot: this.sourceRoot,
				sourceVersion: this.sourceVersion,
			});
			if (!applied.ok) {
				return { type: "error", error: nsInitErrorFromProvisionError(harness, applied.error) };
			}
			installedSkillPaths.push(applied.value.plan.targetArtifactPath);
		}

		return { type: "materialized", installedSkillPaths };
	}
}

function harnessPathEnvironment(env: Record<string, string | undefined>): {
	env?: HarnessPathEnvironment;
} {
	const claudeConfigDir = env.CLAUDE_CONFIG_DIR;
	return claudeConfigDir === undefined ? {} : { env: { CLAUDE_CONFIG_DIR: claudeConfigDir } };
}

function nsInitErrorFromProvisionError(
	harness: HarnessId,
	error: HarnessArtifactProvisionErrorInfo,
): NsInitErrorInfo {
	return {
		code: error.code,
		message: `Failed to materialize objective skills for ${harness}: ${error.message}`,
		details: { harness, ...error.details },
	};
}

function resolveFirstPartyCatalogSourceRoot(): string | undefined {
	let current = dirname(fileURLToPath(import.meta.url));
	for (let index = 0; index < 12; index += 1) {
		if (existsSync(join(current, "skills/objective/SKILL.md"))) return current;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return undefined;
}
