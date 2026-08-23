import { z } from "zod";

export const commanderUsageErrorDataSchema = z.strictObject({
	commanderCode: z.string(),
});

const requestValidationIssueDataSchema = z.strictObject({
	path: z.array(z.union([z.string(), z.number()])),
	message: z.string(),
	code: z.string(),
	surface: z.string().optional(),
});

export const requestValidationUsageErrorDataSchema = z.strictObject({
	issues: z.array(requestValidationIssueDataSchema),
});

export type RequestValidationIssueData = z.infer<typeof requestValidationIssueDataSchema>;

export function commanderUsageErrorData(commanderCode: string) {
	return commanderUsageErrorDataSchema.parse({ commanderCode });
}

export function requestValidationUsageErrorData(issues: readonly RequestValidationIssueData[]) {
	return requestValidationUsageErrorDataSchema.parse({ issues });
}
