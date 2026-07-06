import {
	applyHarnessArtifactProvision,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
	findFirstPartySkillArtifact,
	firstPartySkillProvisionPathContext,
	resolveFirstPartyCatalogSourceRoot,
	type HarnessArtifactProvisionErrorInfo,
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
		this.sourceVersion = options.sourceVersion ?? FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION;
		this.homeDir = options.homeDir ?? options.env?.HOME ?? "";
		this.env = { ...(options.env ?? {}) };
	}

	async materializeObjectiveSkills(
		params: SkillMaterializeParams,
	): Promise<SkillMaterializeResult> {
		if (this.sourceRoot === undefined) {
			return {
				type: "unavailable",
				reason: FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
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
				context: firstPartySkillProvisionPathContext({
					projectRoot: params.repoRoot,
					homeDir: this.homeDir,
					env: this.env,
				}),
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
