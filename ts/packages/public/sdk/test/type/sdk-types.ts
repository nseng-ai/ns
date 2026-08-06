import { defineCommand, defineExtension, defineRawCommand, failure, ok, z } from "@nseng-ai/sdk";
import type {
	ExtensionActivation,
	ExtensionDescriptor,
	NsRawCommandDefinition,
	CommandOutcome,
	NsCommandIo,
	NsExtensionApi,
	NsProgress,
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@nseng-ai/sdk";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const extension = defineExtension({ description: "Typed descriptor." });

const commandlessExtension = defineExtension({ description: "Commandless descriptor." });

const rawCommand = defineRawCommand({
	run(invocation) {
		type InvocationArgv = typeof invocation.argv;
		type InvocationOutput = typeof invocation.output;
		const checks: [
			Assert<IsAny<InvocationArgv> extends false ? true : false>,
			Assert<IsEqual<InvocationArgv, readonly string[]>>,
			Assert<IsAny<InvocationOutput> extends false ? true : false>,
		] = [true, true, true];
		void checks;
		invocation.output.writeStdout(new TextEncoder().encode("raw output"));
		return invocation.argv.length === 0 ? 0 : 1;
	},
});

const adaptedCommand = defineCommand({
	name: "hello",
	summary: "Say hello.",
	description: "Say hello.",
	schema: z.object({ name: z.string() }),
	positionals: { name: { position: 0 } },
	resultSchema: z.object({ greeting: z.string() }),
	async handler(_ctx, request) {
		return ok({ greeting: request.name });
	},
	renderHuman(result, capabilities) {
		type Result = typeof result;
		const checks: [
			Assert<IsAny<Result> extends false ? true : false>,
			Assert<IsEqual<Result, { greeting: string }>>,
		] = [true, true];
		void checks;
		void capabilities.canEmitAnsi;
		return result.greeting;
	},
});

// @ts-expect-error a structured SDK command must declare a result schema
const missingResultSchemaCommand = defineCommand({
	schema: z.object({}),
	renderHuman: () => "",
	handler: () => ok({}),
});

// @ts-expect-error a structured SDK command must declare a human renderer
const missingRendererCommand = defineCommand({
	schema: z.object({}),
	resultSchema: z.object({}),
	handler: () => ok({}),
});

const mismatchedHandlerCommand = defineCommand({
	schema: z.object({}),
	resultSchema: z.object({ count: z.number() }),
	renderHuman: (result) => String(result.count),
	// @ts-expect-error handler success data must satisfy the declared result schema
	handler: () => ok({ count: "not-a-number" }),
});

const mismatchedRendererCommand = defineCommand({
	schema: z.object({}),
	resultSchema: z.object({ count: z.number() }),
	// @ts-expect-error the renderer receives schema-typed data, not arbitrary fields
	renderHuman: (result) => result.missing,
	handler: () => ok({ count: 1 }),
});

const unionResultCommand = defineCommand({
	name: "union",
	summary: "Discriminated union result.",
	description: "Proves renderer narrowing over a discriminated-union result schema.",
	schema: z.object({}),
	resultSchema: z.discriminatedUnion("type", [
		z.object({ type: z.literal("moved"), destination: z.string() }),
		z.object({ type: z.literal("skipped"), reason: z.string() }),
	]),
	handler: () => ok({ type: "moved" as const, destination: "slot-1" }),
	renderHuman(result) {
		if (result.type === "moved") {
			const narrowed: Assert<IsEqual<typeof result.destination, string>> = true;
			void narrowed;
			return result.destination;
		}
		return result.reason;
	},
});

const activation: ExtensionActivation = {
	instructions: "## Hello\n\nUse the hello extension.",
	consumerDirs: [".ns/hello"],
};

const descriptor = defineExtension({
	group: "hello",
	description: "Hello extension.",
	requiresExtensions: ["@example/provider"],
	entries: [
		{
			name: "legacy",
			load: () => ({ default: rawCommand }),
		},
		{
			group: "exec",
			hidden: true,
			description: "Agent-only commands.",
			entries: [{ name: "hello", load: () => ({ default: adaptedCommand }) }],
		},
	],
	points: [{ id: "submit.pre", accepts: "hook", cardinality: "many" }],
	activation,
	bundledArtifacts: [{ kind: "skill", name: "hello", path: "./skills/hello" }],
});

const descriptorCheck: ExtensionDescriptor = descriptor;
const rawCommandCheck: NsRawCommandDefinition = rawCommand;
const outcome: CommandOutcome<unknown> = {
	status: "failure",
	errorType: "x",
	message: "x",
};
const failureExit = failure("wrapped", "wrapped failure");

const textGenerator: TextGenerator = {
	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		return { ok: true, text: request.prompt };
	},
};
const commandIo: NsCommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
	clearPhase: () => {},
};
const progress: NsProgress = { isLive: true, phase: () => {} };
progress.phase({
	type: "phases-declared",
	title: "submit",
	phases: [
		{
			key: "checkpoint",
			name: "Checkpoint",
			substeps: [{ key: "inspect", name: "Inspect" }],
		},
	],
});
function acceptsExtensionApi(api: NsExtensionApi): string {
	const isProviderPresent: boolean = api.hasExtension("@example/provider");
	void isProviderPresent;
	api.commandIo.phase("checking");
	api.progress.phase({ type: "phase-done", phaseKey: "checking" });
	api.progress.phase({
		type: "matrix-declared",
		columns: [{ key: "merge", label: "Merge", width: 6 }],
	});
	api.progress.phase({ type: "matrix-rows", rows: [{ rowKey: "feature-a", label: "feature-a" }] });
	api.progress.phase({
		type: "matrix-cell",
		rowKey: "feature-a",
		columnKey: "merge",
		state: "done",
	});
	return api.cwd;
}

const arbitraryOperationRequest: TextGenerationRequest = {
	modelSelection: { provider: "example", modelId: "example-model", thinking: "minimal" as const },
	system: "system",
	prompt: "prompt",
	operation: "project-specific-operation",
};

const commandResult = { type: "exited", code: 0, signal: null, stdout: "", stderr: "" };
const commandOk: boolean =
	commandResult.type === "exited" && commandResult.code === 0 && commandResult.signal === null;

void extension;
void commandlessExtension;
void missingResultSchemaCommand;
void missingRendererCommand;
void mismatchedHandlerCommand;
void mismatchedRendererCommand;
void unionResultCommand;
void descriptorCheck;
void rawCommandCheck;
void outcome;
void failureExit;
void textGenerator;
void commandIo;
void progress;
void acceptsExtensionApi;
void arbitraryOperationRequest;
void commandOk;
