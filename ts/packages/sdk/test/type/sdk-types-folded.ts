import { defineExtension, defineRawCommand, failure, ok, z } from "@nseng-ai/sdk";
import { defineCommand } from "@nseng-ai/sdk/command";
import type { NsCommandEntry, RawCommandEntry } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsCommandIo,
	NsCommandMessageOptions,
	NsCommandRequest,
	NsExtensionApi,
	NsNotifyLevel,
	NsProgress,
	ActiveOperation,
	NsProgressMatrixCellState,
	NsProgressMatrixColumnInfo,
	NsProgressMatrixEvent,
	NsProgressMatrixRowInfo,
	NsProgressPhaseEvent,
	NsProgressPhaseListener,
	CommandExit,
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@nseng-ai/sdk";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const commandSchema = z.object({
	name: z.string(),
	retries: z.number().int().default(0),
});

type CommandRequest = NsCommandRequest<typeof commandSchema>;
type CommandRequestChecks = [
	Assert<IsAny<CommandRequest> extends false ? true : false>,
	Assert<IsEqual<CommandRequest, { name: string; retries: number }>>,
];

const commandRequestChecks: CommandRequestChecks = [true, true];

// @ts-expect-error name is required by the command schema output
const missingNameRequest: CommandRequest = { retries: 1 };

const greetCommand = defineRawCommand({
	name: "greet",
	summary: "Greet someone.",
	description: "Greet someone with retry metadata.",
	run: () => ok("hello"),
});

const noInputCommand = defineCommand({
	name: "status",
	summary: "Show status.",
	resultSchema: z.object({ ready: z.boolean() }),
	handler(_bundle, request) {
		type Request = typeof request;
		const checks: [
			Assert<IsAny<Request> extends false ? true : false>,
			Assert<IsEqual<Request, Record<string, never>>>,
		] = [true, true];
		void checks;
		return ok({ ready: true });
	},
});

const nsEntry: NsCommandEntry = {
	kind: "ns-command",
	name: "status",
	load: () => ({ default: noInputCommand }),
};
const rawEntry: RawCommandEntry = {
	kind: "raw-command",
	name: "greet",
	load: () => ({ default: greetCommand }),
};
const rawForMismatch = defineRawCommand({
	name: "raw",
	summary: "Raw.",
	description: "Raw.",
	run: () => ok("raw"),
});
const wrongNsEntry: NsCommandEntry = {
	kind: "ns-command",
	name: "raw",
	// @ts-expect-error ns-command loaders cannot return raw command modules
	load: () => ({ default: rawForMismatch }),
};

const extension = defineExtension({
	description: "Greet extension.",
	entries: [
		{
			kind: "raw-command",
			name: "greet",
			requiresExtension: "@example/provider",
			load: () => ({ default: greetCommand }),
		},
	],
});

const commandlessExtension = defineExtension({ description: "Commandless descriptor." });

const textGenerator: TextGenerator = {
	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		return { ok: true, text: request.prompt };
	},
};

const execResult: ExecResult = { type: "exited", code: 0, signal: null, stdout: "ok", stderr: "" };
const commandOk: boolean =
	execResult.type === "exited" && execResult.code === 0 && execResult.signal === null;
const successfulResult: CommandExit = ok("done");
const failedResult: CommandExit = failure("test-failed", "nope");
const notifyLevel: NsNotifyLevel = "info";
const messageOptions: NsCommandMessageOptions = { level: notifyLevel, details: { ok: true } };
const commandIo: NsCommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
	clearPhase: () => {},
};
const progressEvent: NsProgressPhaseEvent = { type: "phase-started", phaseKey: "test" };
const activeOperation: ActiveOperation = {
	kind: "model",
	operation: "generating PR metadata",
	modelRef: "openai-codex/gpt-5.4-mini",
};
const matrixCellState: NsProgressMatrixCellState = "active";
const matrixColumn: NsProgressMatrixColumnInfo = { key: "merge", label: "Merge", width: 6 };
const matrixRow: NsProgressMatrixRowInfo = { rowKey: "feature-a", label: "feature-a (#1)" };
const matrixEvents: NsProgressMatrixEvent[] = [
	{
		type: "matrix-declared",
		columns: [matrixColumn],
		labelHeader: "Branch / PR",
	},
	{ type: "matrix-rows", rows: [matrixRow] },
	{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: matrixCellState },
	{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: "done", text: "ok" },
	{ type: "matrix-active-operations", operations: [activeOperation] },
];
const matrixEventsWiden: NsProgressPhaseEvent[] = matrixEvents;
const progressListener: NsProgressPhaseListener = (_event) => {};
const progress: NsProgress = { isLive: true, phase: progressListener };

function acceptsExtensionApi(api: NsExtensionApi): string {
	const isProviderPresent: boolean = api.hasExtension("@example/provider");
	void isProviderPresent;
	api.commandIo.notify("checked");
	api.progress.phase(progressEvent);
	return api.cwd;
}

void commandRequestChecks;
void nsEntry;
void rawEntry;
void wrongNsEntry;
void missingNameRequest;
void extension;
void commandlessExtension;
void textGenerator;
void commandOk;
void successfulResult;
void failedResult;
void messageOptions;
void commandIo;
void matrixEvents;
void matrixEventsWiden;
void progress;
void acceptsExtensionApi;
