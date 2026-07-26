import { defineCommand, ok, z } from "@nseng-ai/sdk";
import { commandError, duplicateCanonicalInput } from "../command-support.ts";
import { NodeSkillExposureGateway } from "../node-skill-exposure-gateway.ts";
import type { SkillExposureGateway, SkillInspection } from "../types.ts";
import { showResultSchema, toShowRecord } from "../schemas.ts";

type GatewayFactory = (cwd: string) => SkillExposureGateway;

export function createSkillExposureShowCommand(
	createGateway: GatewayFactory = (cwd) => new NodeSkillExposureGateway(cwd),
) {
	return defineCommand({
		name: "show",
		summary: "Show retained exposure policy for explicit skill paths.",
		description: "Inspect one or more explicit skill directories or direct SKILL.md paths.",
		schema: z.object({ paths: z.array(z.string()).min(1) }),
		positionals: { paths: { position: 0 } },
		resultSchema: showResultSchema,
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
				return ok({ skills: inspections.map(toShowRecord) });
			} catch (error) {
				return commandError(error, request.paths);
			}
		},
		renderHuman: (result) =>
			result.skills
				.map((skill) => `${skill.skill}: ${skill.policy}\n${skill.canonicalPath}`)
				.join("\n\n"),
	});
}

export const skillExposureShowCommand = createSkillExposureShowCommand();
export default skillExposureShowCommand;
