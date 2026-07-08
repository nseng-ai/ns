import {
	defineCommand,
	defineExtension,
	defineRawCommand,
	failure,
	ok,
	okExit,
	z,
} from "@nseng-ai/kernel/sdk";
import type {
	ExtensionDescriptor,
	KernelCommand,
	MachineEnvelope,
	NsCommandIo,
	NsExtensionApi,
	NsProgress,
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@nseng-ai/kernel/sdk";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const extension = defineExtension({
	commands: [
		{
			name: "first",
			summary: "First.",
			description: "First command.",
			run() {
				return ok("first");
			},
		},
		{
			name: "second",
			summary: "Second.",
			description: "Second command.",
			schema: z.object({ second: z.string() }),
			run(_ctx, request) {
				return ok(request.second);
			},
		},
		{
			name: "third",
			summary: "Third.",
			description: "Third command.",
			schema: z.object({ third: z.number() }),
			run(_ctx, request) {
				return ok(String(request.third));
			},
		},
		{
			name: "fourth",
			summary: "Fourth.",
			description: "Fourth command.",
			schema: z.object({ fourth: z.boolean() }),
			run(_ctx, request) {
				type Request = typeof request;
				const checks: [
					Assert<IsAny<Request> extends false ? true : false>,
					Assert<IsEqual<Request, { fourth: boolean }>>,
				] = [true, true];
				void checks;
				// @ts-expect-error missing is not part of the fourth command schema
				void request.missing;
				return ok(request.fourth ? "yes" : "no");
			},
		},
		{
			name: "fifth",
			summary: "Fifth.",
			description: "Fifth command.",
			schema: z.object({ fifth: z.string() }),
			run(_ctx, request) {
				type Request = typeof request;
				const checks: [
					Assert<IsAny<Request> extends false ? true : false>,
					Assert<IsEqual<Request, { fifth: string }>>,
				] = [true, true];
				void checks;
				// @ts-expect-error missing is not part of the fifth command schema
				void request.missing;
				return ok(request.fifth);
			},
		},
	],
});

const commandlessExtension = defineExtension({});

const rawCommand = defineRawCommand({
	name: "legacy",
	summary: "Legacy wrapper.",
	description: "Legacy wrapper command.",
	resultSchema: z.object({ argv: z.array(z.string()) }),
	run(_ctx, invocation) {
		type InvocationArgv = typeof invocation.argv;
		const checks: [
			Assert<IsAny<InvocationArgv> extends false ? true : false>,
			Assert<IsEqual<InvocationArgv, readonly string[]>>,
		] = [true, true];
		void checks;
		return { type: "ok", data: { argv: [...invocation.argv] } };
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
		return okExit({ greeting: request.name });
	},
});

const descriptor = defineExtension({
	group: "hello",
	description: "Hello extension.",
	entries: [
		{ name: "legacy", load: () => ({ default: rawCommand }) },
		{
			group: "exec",
			hidden: true,
			description: "Agent-only commands.",
			entries: [{ name: "hello", load: () => ({ default: adaptedCommand }) }],
		},
	],
	points: [{ id: "submit.pre", accepts: "hook", cardinality: "many" }],
	bundledArtifacts: [{ kind: "skill", name: "hello", path: "./skills/hello" }],
});

const descriptorCheck: ExtensionDescriptor = descriptor;
const rawCommandCheck: KernelCommand = rawCommand;
const envelope: MachineEnvelope = { status: "failure", exitCode: 2, errorType: "x", message: "x" };
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

function acceptsExtensionApi(api: NsExtensionApi): string {
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
	modelRef: "example-model",
	system: "system",
	prompt: "prompt",
	operation: "project-specific-operation",
};

const commandResult = { code: 0, stdout: "", stderr: "", killed: false };
const commandOk: boolean = commandResult.code === 0 && !commandResult.killed;

void extension;
void commandlessExtension;
void descriptorCheck;
void rawCommandCheck;
void envelope;
void failureExit;
void textGenerator;
void commandIo;
void progress;
void acceptsExtensionApi;
void arbitraryOperationRequest;
void commandOk;
