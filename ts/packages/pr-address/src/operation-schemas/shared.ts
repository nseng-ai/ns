import { z } from "zod";
import { type JsonSchemaDocument } from "@asdl/clinkr";

import { nullableIntSchema, nullableStringSchema } from "../core/operation-schemas/shared.ts";

export { nullableIntSchema, nullableStringSchema };

export function schemaDocument(requestSchema: z.ZodType, resultSchema: z.ZodType): JsonSchemaDocument {
	return {
		input_json_schema: z.toJSONSchema(requestSchema),
		output_json_schema: z.toJSONSchema(resultSchema),
	};
}
