import { z } from "zod";

export interface JsonSchemaDocument {
	input_json_schema: unknown;
	output_json_schema: unknown;
}

export function buildJsonSchemaDocument(
	requestSchema: z.ZodObject,
	resultSchema: z.ZodType | undefined,
): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(requestSchema, { io: "input" }),
		output_json_schema:
			resultSchema === undefined ? {} : z.toJSONSchema(resultSchema, { io: "output" }),
	};
}
