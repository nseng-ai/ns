import {
	createClinkrApp,
	defineCommand,
	failure,
	negative,
	ok,
	usageError,
} from "@nseng-ai/clinkr/app";
import { z } from "zod";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;

const requestSchema = z.object({ count: z.number() });
const resultSchema = z.object({ value: z.string() });

defineCommand({
	schema: requestSchema,
	resultSchema,
	handler: async (request) => {
		type RequestIsNotAny = Assert<Not<IsAny<typeof request>>>;
		const requestIsNotAny: RequestIsNotAny = true;
		if (!requestIsNotAny) return usageError("unreachable");
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
// @ts-expect-error success without resultSchema rejects a data payload.
defineCommand({ schema: requestSchema, handler: async () => ok("unexpected") });

// Error outcomes accept any freeform diagnostics without declared schemas.
defineCommand({
	schema: requestSchema,
	handler: async () => negative("no", { data: { arbitrary: [1, "x", true] } }),
});
defineCommand({
	schema: requestSchema,
	handler: async () => failure("x", "x", "freeform string diagnostics"),
});
defineCommand({
	schema: requestSchema,
	handler: async () => usageError("x", ["any", "json"]),
});

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
