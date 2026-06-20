import { z } from "zod";
import { type JsonSchemaDocument } from "@asdl/clinkr";

export function schemaDocument(
	requestSchema: z.ZodType,
	resultSchema: z.ZodType,
): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(requestSchema, { io: "input" }),
		output_json_schema: z.toJSONSchema(resultSchema, { io: "output" }),
	};
}
