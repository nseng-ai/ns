import { z } from "zod";

import { buildMachineEnvelopeSchema, type ClinkrOutcomeSchemas } from "./exit.ts";

export interface JsonSchemaDocument {
	inputJsonSchema: unknown;
	outputJsonSchema: unknown;
	machineEnvelopeJsonSchema: unknown;
}

export function buildJsonSchemaDocument(
	requestSchema: z.ZodObject,
	schemas: ClinkrOutcomeSchemas | z.ZodType | undefined,
): JsonSchemaDocument {
	const outcomeSchemas: ClinkrOutcomeSchemas =
		schemas === undefined ? {} : schemas instanceof z.ZodType ? { resultSchema: schemas } : schemas;
	return {
		inputJsonSchema: z.toJSONSchema(requestSchema, { io: "input" }),
		outputJsonSchema:
			outcomeSchemas.resultSchema === undefined
				? {}
				: z.toJSONSchema(outcomeSchemas.resultSchema, { io: "output" }),
		machineEnvelopeJsonSchema: z.toJSONSchema(buildMachineEnvelopeSchema(outcomeSchemas), {
			io: "output",
		}),
	};
}
