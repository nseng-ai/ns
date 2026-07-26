import { defineCommand, negative, ok, usageError, z } from "@nseng-ai/sdk";
import { commandError, duplicateCanonicalInput } from "../command-support.ts";
import { NodeSkillExposureGateway } from "../node-skill-exposure-gateway.ts";
import { planSkillExposure, settingsForPolicy } from "../policy.ts";
import {
	applyResultSchema,
	commandFailureDataSchema,
	commandUsageErrorDataSchema,
} from "../schemas.ts";
import type {
	OperationResult,
	SkillExposureBatch,
	SkillExposureGateway,
	SkillInspection,
	SkillPlan,
} from "../types.ts";
import { EXPOSURE_POLICIES } from "../types.ts";

type GatewayFactory = (cwd: string) => SkillExposureGateway;

export function createSkillExposureApplyCommand(
	createGateway: GatewayFactory = (cwd) => new NodeSkillExposureGateway(cwd),
) {
	return defineCommand({
		name: "apply",
		summary: "Apply one exposure policy to explicit skill paths.",
		description:
			"Resolve and preflight the complete batch before writing. Managed deletions require --yes outside an interactive host.",
		schema: z.object({
			policy: z.enum(EXPOSURE_POLICIES),
			paths: z.array(z.string()).min(1),
			dryRun: z.boolean().default(false),
			yes: z.boolean().default(false),
		}),
		positionals: { policy: { position: 0 }, paths: { position: 1 } },
		options: { dryRun: { short: "-n" }, yes: { short: "-y" } },
		resultSchema: applyResultSchema,
		negativeSchema: applyResultSchema,
		failureSchema: commandFailureDataSchema,
		usageErrorSchema: commandUsageErrorDataSchema,
		handler: async (ctx, request) => {
			const gateway = createGateway(ctx.cwd);
			try {
				const initialSettings = await gateway.readPiSettings();
				let finalSettings = initialSettings;
				const plans: SkillPlan[] = [];
				const inspections: SkillInspection[] = [];
				for (const input of request.paths) {
					const inspection = await gateway.inspectSkill(input, finalSettings);
					const duplicate = duplicateCanonicalInput(inspections, inspection);
					if (duplicate !== undefined) throw duplicate;
					inspections.push(inspection);
					plans.push(planSkillExposure(inspection, request.policy));
					finalSettings = settingsForPolicy(finalSettings, inspection.skill, request.policy);
				}
				const batch: SkillExposureBatch = { plans, initialSettings, finalSettings };
				await gateway.preflightBatch(batch);
				const hasDeletion = plans.some((plan) =>
					plan.operations.some(
						(operation) => operation.type === "delete" || operation.type === "remove-empty-dir",
					),
				);
				if (!request.dryRun && hasDeletion && !request.yes) {
					if (ctx.confirm === undefined)
						return usageError("Managed overlay deletion requires --yes in non-interactive use.", {
							missingFlag: "--yes",
							paths: [...request.paths],
						});
					const accepted = await ctx.confirm(
						"Delete managed skill overlays?",
						plans
							.flatMap((plan) => plan.operations)
							.filter(
								(operation) => operation.type === "delete" || operation.type === "remove-empty-dir",
							)
							.map((operation) => operation.path)
							.join("\n"),
						{ defaultAnswer: "no" },
					);
					if (!accepted)
						return negative("Skill exposure apply was cancelled.", resultFor(batch, false, []));
				}
				const applied = request.dryRun ? [] : await gateway.applyBatch(batch);
				return ok(resultFor(batch, request.dryRun, applied));
			} catch (error) {
				return commandError(error, request.paths);
			}
		},
		renderHuman: (result) => {
			const skillLines = result.skills.map((skill) => {
				const applied = skill.operations.filter(
					(operation) => operation.outcome === "applied",
				).length;
				const planned = skill.operations.filter(
					(operation) => operation.outcome === "planned",
				).length;
				const skipped = skill.operations.filter(
					(operation) => operation.outcome === "skipped",
				).length;
				return `${skill.skill}: ${applied} applied, ${planned} planned, ${skipped} skipped`;
			});
			const sharedLines = result.sharedOperations.map(
				(operation) => `${operation.path}: ${operation.outcome} (${operation.evidence})`,
			);
			return [...skillLines, ...sharedLines].join("\n");
		},
	});
}

function resultFor(
	batch: SkillExposureBatch,
	dryRun: boolean,
	applied: readonly OperationResult[],
) {
	const perSkillResults = applied.filter((result) => result.type !== "write-settings");
	let resultIndex = 0;
	const settingsChanged =
		batch.initialSettings.exists !== batch.finalSettings.exists ||
		JSON.stringify(batch.initialSettings.data) !== JSON.stringify(batch.finalSettings.data);
	const settingsResult = applied.find((result) => result.type === "write-settings");
	return {
		policy: batch.plans[0]?.policy ?? ("normal" as const),
		dryRun,
		skills: batch.plans.map((plan) => ({
			skill: plan.skill,
			canonicalPath: plan.canonicalPath,
			operations: plan.operations.map((operation) => {
				if (dryRun)
					return {
						type: operation.type,
						path: operation.path,
						outcome: operation.type === "skip" ? ("skipped" as const) : ("planned" as const),
						evidence: operation.type === "skip" ? operation.evidence : operation.description,
					};
				const result = perSkillResults[resultIndex];
				resultIndex += 1;
				return (
					result ?? {
						type: operation.type,
						path: operation.path,
						outcome: "skipped" as const,
						evidence: "not executed",
					}
				);
			}),
		})),
		sharedOperations: [
			dryRun
				? {
						type: "write-settings" as const,
						path: ".pi/settings.json",
						outcome: settingsChanged ? ("planned" as const) : ("skipped" as const),
						evidence: settingsChanged
							? "consolidated Pi settings write"
							: "Pi settings already current",
					}
				: (settingsResult ?? {
						type: "write-settings" as const,
						path: ".pi/settings.json",
						outcome: "skipped" as const,
						evidence: "Pi settings already current",
					}),
		],
	};
}

export const skillExposureApplyCommand = createSkillExposureApplyCommand();
export default skillExposureApplyCommand;
