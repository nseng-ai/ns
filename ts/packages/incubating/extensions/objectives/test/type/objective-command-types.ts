import { ok } from "@nseng-ai/clinkr";
import { z } from "zod";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	objectiveNsCommand,
	objectiveNsCommandWithContext,
} from "../../src/ns/objective-command.ts";

const requestSchema = z.object({ value: z.string() });
const resultSchema = z.object({ value: z.string() });

interface CustomContext {
	readonly prefix: string;
}

const defaultCommand = objectiveNsCommand({
	schema: requestSchema,
	resultSchema,
	handler(context, request) {
		const contextCheck: ObjectiveCliContext = context;
		void contextCheck;
		return ok({ value: request.value });
	},
});

const customCommand = objectiveNsCommandWithContext({
	schema: requestSchema,
	resultSchema,
	createContext: (): CustomContext => ({ prefix: "custom" }),
	handler(context, request) {
		return ok({ value: `${context.prefix}:${request.value}` });
	},
});

// @ts-expect-error A specialized context requires an explicit factory.
objectiveNsCommandWithContext<typeof requestSchema, { value: string }, CustomContext>({
	schema: requestSchema,
	resultSchema,
	handler(_context, request) {
		return ok({ value: request.value });
	},
});

objectiveNsCommand({
	schema: requestSchema,
	resultSchema,
	// @ts-expect-error The default helper always supplies ObjectiveCliContext.
	handler(_context: CustomContext, request) {
		return ok({ value: request.value });
	},
});

void defaultCommand;
void customCommand;
