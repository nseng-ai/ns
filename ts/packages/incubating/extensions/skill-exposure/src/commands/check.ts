import { defineCommand, negative, ok, z } from "@nseng-ai/sdk";
import { commandError, duplicateCanonicalInput } from "../command-support.ts";
import { NodeSkillExposureGateway } from "../node-skill-exposure-gateway.ts";
import type { SkillExposureGateway, SkillInspection } from "../types.ts";
import {
	checkResultSchema,
	commandFailureDataSchema,
	commandUsageErrorDataSchema,
	toShowRecord,
} from "../schemas.ts";

type GatewayFactory = (cwd: string) => SkillExposureGateway;

export function createSkillExposureCheckCommand(
	createGateway: GatewayFactory = (cwd) => new NodeSkillExposureGateway(cwd),
) {
	return defineCommand({
		name: "check",
		summary: "Check exposure overlays for explicit skill paths.",
		description:
			"Exit negatively when any selected skill is inconsistent or lacks required replacement evidence.",
		schema: z.object({ paths: z.array(z.string()).min(1) }),
		positionals: { paths: { position: 0 } },
		resultSchema: checkResultSchema,
		negativeSchema: checkResultSchema,
		failureSchema: commandFailureDataSchema,
		usageErrorSchema: commandUsageErrorDataSchema,
		handler: async (ctx, request) => {
			const gateway = createGateway(ctx.cwd);
			try {
				const settings = await gateway.readPiSettings();
				const inspections: SkillInspection[] = [];
				for (const input of request.paths) {
					const inspection = await gateway.inspectSkill(input, settings);
					const duplicate = duplicateCanonicalInput(inspections, inspection);
					if (duplicate !== undefined) throw duplicate;
					inspections.push(inspection);
				}
				const skills = inspections.map(toShowRecord);
				const result = { ok: skills.every((skill) => skill.policy !== "inconsistent"), skills };
				return result.ok
					? ok(result)
					: negative("Skill exposure overlays are inconsistent.", result);
			} catch (error) {
				return commandError(error, request.paths);
			}
		},
		renderHuman: (result) =>
			result.skills.map((skill) => `${skill.skill}: ${skill.policy}`).join("\n"),
	});
}

export const skillExposureCheckCommand = createSkillExposureCheckCommand();
export default skillExposureCheckCommand;
