import {
	createClinkrApp,
	defineCommand,
	failure,
	negative,
	ok,
	usageError,
} from "@nseng-ai/clinkr/app";
import { defineRawCommand, type ContextfulRawCommandInvocation } from "@nseng-ai/clinkr/raw";
import { z } from "zod";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

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

defineCommand({
	schema: requestSchema,
	completionProvider: (request) => {
		type CurrentStaysString = Assert<IsEqual<typeof request.current, string>>;
		type WordsAreReadonly = Assert<IsEqual<typeof request.words, readonly string[]>>;
		const contractsHold: CurrentStaysString & WordsAreReadonly = true;
		return contractsHold ? [{ value: request.current, type: "positional-value" }] : [];
	},
	handler: async () => ok(),
});
defineCommand({
	requiresContext: true,
	schema: requestSchema,
	completionProvider: (context: Context, request) => [
		{ value: context.prefix + request.commandPath.join("/"), type: "positional-value" },
	],
	handler: async (_context: Context) => ok(),
});

const contextFreeApp = createClinkrApp({ name: "free", commandDirectory: import.meta.dirname });
void contextFreeApp.run([]);
void contextFreeApp.complete({ words: [""] });
void contextFreeApp.complete({ words: [""] }, { output: { stdout: () => {}, stderr: () => {} } });
// @ts-expect-error context-free completion does not accept invocation context.
void contextFreeApp.complete({ words: [""] }, { context: { prefix: "x" } });
// @ts-expect-error context-free invocation does not accept context.
void contextFreeApp.run([], { context: { prefix: "x" } });

const contextfulApp = createClinkrApp<Context>({
	name: "contextful",
	commandDirectory: import.meta.dirname,
	requiresContext: true,
});
void contextfulApp.run([], { context: { prefix: "x" } });
void contextfulApp.complete({ words: [""] }, { context: { prefix: "x" } });
void contextfulApp.complete(
	{ words: [""] },
	{
		context: { prefix: "x" },
		output: { stdout: () => {}, stderr: () => {} },
	},
);
// @ts-expect-error contextful completion requires context.
void contextfulApp.complete({ words: [""] });
// @ts-expect-error contextful invocation requires context.
void contextfulApp.run([]);

const callbackOnlyApp = createClinkrApp({ name: "callback-only" }, (composition) => {
	composition.filesystem({ commandDirectory: import.meta.dirname, label: "mounted-root" });
	composition.source({ label: "programmatic" }, (scope) => {
		scope.defaultCommand({ description: "Default." }, async () =>
			defineCommand({ schema: requestSchema, handler: async () => ok() }),
		);
		scope.group("nested", { description: "Nested." }, (nested) => {
			nested.filesystem({ commandDirectory: import.meta.dirname });
			nested.command("run", { description: "Run." }, async () =>
				defineCommand({ schema: requestSchema, handler: async () => ok() }),
			);
		});
	});
});
void callbackOnlyApp.run([]);

const callbackContextfulApp = createClinkrApp<Context>(
	{ name: "callback-contextful", requiresContext: true },
	(composition) => {
		composition.source({ label: "contextful" }, (scope) => {
			scope.defaultCommand({ description: "Default." }, async () =>
				defineCommand({
					requiresContext: true,
					schema: requestSchema,
					handler: async (_context: Context) => ok(),
				}),
			);
		});
	},
);
void callbackContextfulApp.run([], { context: { prefix: "x" } });
// @ts-expect-error callback contextful invocation requires context.
void callbackContextfulApp.run([]);

// @ts-expect-error callback-only construction requires the callback argument.
createClinkrApp({ name: "missing-source" });

createClinkrApp({ name: "loader-contract" }, (composition) => {
	composition.source({ label: "loader" }, (scope) => {
		// @ts-expect-error definition loaders must return a structured or raw definition.
		scope.defaultCommand({ description: "Bad." }, async () => ({ bad: true }));
		// @ts-expect-error filesystem mounts require a commandDirectory.
		scope.filesystem({});
	});
	// @ts-expect-error composition filesystem mounts require a commandDirectory.
	composition.filesystem({ label: "bad" });
});

// Public apps expose execution only, not topology nodes or lifecycle controls.
// @ts-expect-error topology nodes are private.
void callbackOnlyApp.root;
// @ts-expect-error publication is unsupported.
callbackOnlyApp.publish();
// @ts-expect-error cache invalidation is unsupported.
callbackOnlyApp.invalidate();

// Raw definitions: invocation objects, numeric exit status, and the shared
// requiresContext discriminant.
const rawContextFree = defineRawCommand({
	run: ({ argv, output }) => {
		type ArgvIsReadonly = Assert<IsEqual<typeof argv, readonly string[]>>;
		const argvIsReadonly: ArgvIsReadonly = true;
		void argvIsReadonly;
		output.writeStdout(new TextEncoder().encode(argv.join(" ")));
		return argv.length;
	},
});
void rawContextFree;

// Async numeric exit status is accepted.
defineRawCommand({ run: async () => 0 });

const rawContextful = defineRawCommand<Context>({
	requiresContext: true,
	run: ({ context, argv, output }) => {
		type ContextIsNotAny = Assert<Not<IsAny<typeof context>>>;
		const contextIsNotAny: ContextIsNotAny = true;
		void contextIsNotAny;
		output.writeStdout(new TextEncoder().encode(context.prefix + argv.length));
		return 0;
	},
});
void rawContextful;

// @ts-expect-error raw definitions require run.
defineRawCommand({});
// @ts-expect-error raw run must return a numeric exit status.
defineRawCommand({ run: () => "0" });
// @ts-expect-error raw run cannot return a structured outcome.
defineRawCommand({ run: () => ok() });
// @ts-expect-error raw definitions cannot declare structured-only members (schema).
defineRawCommand({ run: () => 0, schema: requestSchema });
// @ts-expect-error raw definitions cannot declare structured-only members (handler).
defineRawCommand({ run: () => 0, handler: async () => ok() });
// @ts-expect-error raw definitions cannot declare structured-only members (renderers).
defineRawCommand({ run: () => 0, renderHuman: () => "" });
// @ts-expect-error contextful raw run requires the requiresContext discriminant.
defineRawCommand({ run: (_invocation: ContextfulRawCommandInvocation<Context>) => 0 });
