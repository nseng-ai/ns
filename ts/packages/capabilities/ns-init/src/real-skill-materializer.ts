import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	provisionFirstPartySkill,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessId,
	type ProvisionFirstPartySkillOutcome,
} from "@nseng-ai/harness-artifacts/api";

import type { NsInitErrorInfo } from "./error-info.ts";
import type {
	SkillMaterializeParams,
	SkillMaterializer,
	SkillMaterializeResult,
} from "./skill-materializer.ts";

export interface SkillMaterializationContext {
	/** User home already adapted by the ns-init command/API layer, when materialization needs user scope. */
	userHomeDir?: string;
	env: Record<string, string | undefined>;
}

export interface RealSkillMaterializerOptions {
	context?: SkillMaterializationContext;
}

export class RealSkillMaterializer implements SkillMaterializer {
	private readonly context: SkillMaterializationContext;

	constructor(options: RealSkillMaterializerOptions = {}) {
		this.context = {
			env: { ...(options.context?.env ?? {}) },
			...optionalEntry("userHomeDir", options.context?.userHomeDir),
		};
	}

	async materializeObjectiveSkills(
		params: SkillMaterializeParams,
	): Promise<SkillMaterializeResult> {
		const installedSkillPaths: string[] = [];
		for (const harness of params.harnesses) {
			const outcome = await provisionFirstPartySkill({
				skill: "objective",
				harness,
				scope: "project",
				projectRoot: params.repoRoot,
				...optionalEntry("homeDir", this.context.userHomeDir),
				env: this.context.env,
				isDryRun: false,
				shouldForce: false,
			});
			switch (outcome.type) {
				case "catalog-source-unavailable":
					return { type: "unavailable", reason: outcome.message };
				case "unknown-skill":
					return {
						type: "error",
						error: {
							code: "objective-skill-catalog-missing",
							message:
								"The first-party objective skill is missing from the harness artifact catalog.",
						},
					};
				case "error":
					return { type: "error", error: nsInitErrorFromProvisionError(harness, outcome.error) };
				case "conflicted":
					return {
						type: "error",
						error: nsInitErrorFromProvisionConflict(harness, outcome),
					};
				case "provisioned":
					installedSkillPaths.push(outcome.plan.targetArtifactPath);
			}
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

function nsInitErrorFromProvisionConflict(
	harness: HarnessId,
	conflict: Extract<ProvisionFirstPartySkillOutcome, { type: "conflicted" }>,
): NsInitErrorInfo {
	return {
		code: "locally-edited-conflict",
		message: `Failed to materialize objective skills for ${harness}: ${conflict.conflictingFiles.length} target file(s) have local edits.`,
		details: {
			harness,
			manifestPath: conflict.manifestPath,
			conflictingFiles: [...conflict.conflictingFiles],
		},
	};
}
