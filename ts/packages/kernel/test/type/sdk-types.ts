import {
	defineCommand,
	defineExtension,
	defineRawCommand,
	failure,
	ok,
	z,
} from "@nseng-ai/kernel/sdk";
import type {
	ExtensionDescriptor,
	RawArgvCommand,
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

const extension = defineExtension({ description: "Typed descriptor." });

const commandlessExtension = defineExtension({ description: "Commandless descriptor." });

const rawCommand = defineRawCommand({
	name: "legacy",
	summary: "Legacy wrapper.",
	description: "Legacy wrapper command.",
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
		return ok({ greeting: request.name });
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
const rawCommandCheck: RawArgvCommand = rawCommand;
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

const commandResult = { type: "exited", code: 0, signal: null, stdout: "", stderr: "" };
const commandOk: boolean =
	commandResult.type === "exited" && commandResult.code === 0 && commandResult.signal === null;

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
