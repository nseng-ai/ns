import { z } from "zod";

import { buildMachineEnvelopeSchema } from "./exit.ts";

export interface JsonSchemaDocument {
	inputJsonSchema: unknown;
	outputJsonSchema: unknown;
	machineEnvelopeJsonSchema: unknown;
}

export function buildJsonSchemaDocument(
	requestSchema: z.ZodObject,
	resultSchema: z.ZodType | undefined,
): JsonSchemaDocument {
	const outputSchema = resultSchema ?? z.unknown();
	return {
		inputJsonSchema: z.toJSONSchema(requestSchema, { io: "input" }),
		outputJsonSchema:
			resultSchema === undefined ? {} : z.toJSONSchema(resultSchema, { io: "output" }),
		machineEnvelopeJsonSchema: z.toJSONSchema(buildMachineEnvelopeSchema(outputSchema), {
			io: "output",
		}),
	};
}
