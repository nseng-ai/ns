import {
	createClinkrApp,
	defineCommand,
	failure,
	negative,
	ok,
	usageError,
} from "@nseng-ai/clinkr";
import { z } from "zod";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;

const requestSchema = z.object({ count: z.number() });
const resultSchema = z.object({ value: z.string() });
const negativeSchema = z.object({ reason: z.string() });
const failureSchema = z.object({ service: z.string() });
const usageErrorSchema = z.object({ flag: z.string() });

defineCommand({
	schema: requestSchema,
	resultSchema,
	negativeSchema,
	failureSchema,
	usageErrorSchema,
	handler: async (request) => {
		type RequestIsNotAny = Assert<Not<IsAny<typeof request>>>;
		const requestIsNotAny: RequestIsNotAny = true;
		if (!requestIsNotAny) return usageError("unreachable", { flag: "--count" });
		if (request.count === 0) return negative("zero", { data: { reason: "zero" } });
		if (request.count < 0) return failure("service", "down", { service: "counter" });
		if (!Number.isFinite(request.count)) return usageError("invalid", { flag: "--count" });
		return ok({ value: String(request.count) });
	},
});

// @ts-expect-error request is inferred from schema.
defineCommand({ schema: requestSchema, handler: async (request) => ok(request.missing) });
// @ts-expect-error result data must match resultSchema.
defineCommand({ schema: requestSchema, resultSchema, handler: async () => ok({ value: 1 }) });
// @ts-expect-error configured negative status requires matching data.
defineCommand({ schema: requestSchema, negativeSchema, handler: async () => negative("no") });
defineCommand({
	schema: requestSchema,
	failureSchema,
	// @ts-expect-error configured failure data must match failureSchema.
	handler: async () => failure("x", "x", { service: 1 }),
});
defineCommand({
	schema: requestSchema,
	usageErrorSchema,
	// @ts-expect-error configured usage-error data must match usageErrorSchema.
	handler: async () => usageError("x", { flag: 1 }),
});
// @ts-expect-error bodyless success rejects data.
defineCommand({ schema: requestSchema, handler: async () => ok("unexpected") });

interface Context {
	readonly prefix: string;
}

defineCommand({
	requiresContext: true,
	schema: requestSchema,
	resultSchema,
	handler: async (context: Context, request) => ok({ value: context.prefix + request.count }),
});
// @ts-expect-error contextful handlers require the discriminant.
defineCommand({ schema: requestSchema, handler: async (_context: Context, _request) => ok() });
// @ts-expect-error context-free handlers receive only request.
defineCommand({ schema: requestSchema, handler: async (_context, _request) => ok() });

const contextFreeApp = createClinkrApp({ name: "free", commandDirectory: import.meta.dirname });
void contextFreeApp.run([]);
// @ts-expect-error context-free invocation does not accept context.
void contextFreeApp.run([], { context: { prefix: "x" } });

const contextfulApp = createClinkrApp<Context>({
	name: "contextful",
	commandDirectory: import.meta.dirname,
	requiresContext: true,
});
void contextfulApp.run([], { context: { prefix: "x" } });
// @ts-expect-error contextful invocation requires context.
void contextfulApp.run([]);
