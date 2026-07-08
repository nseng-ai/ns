import { defineExtension, failed, ok, z } from "@nseng-ai/kernel/sdk";
import type {
	ExecResult,
	PositionalSpec,
	NsExtensionManifest,
	NsExtensionManifestCommand,
	NsExtensionPackageManifest,
	NsCommandIo,
	NsCommandMessageOptions,
	NsCommandRequest,
	NsExtensionApi,
	NsNotifyLevel,
	NsProgress,
	NsProgressMatrixCellState,
	NsProgressMatrixColumnInfo,
	NsProgressMatrixRowInfo,
	NsProgressPhaseEvent,
	NsProgressPhaseListener,
	NsResult,
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@nseng-ai/kernel/sdk";

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
const positionalSpec: PositionalSpec = { position: 0 };
const manifestCommand: NsExtensionManifestCommand = {
	name: "changes",
	path: ["flow", "changes"],
	description: "Show changes.",
	entry: "./src/changes.ts",
};
const manifest: NsExtensionManifest = { group: "flow", commands: [manifestCommand] };
const packageManifest: NsExtensionPackageManifest = {
	description: "Flow commands.",
	ns: manifest,
};

// @ts-expect-error name is required by the command schema output
const missingNameRequest: CommandRequest = { retries: 1 };

const extension = defineExtension({
	commands: [
		{
			name: "greet",
			summary: "Greet someone.",
			description: "Greet someone with retry metadata.",
			schema: commandSchema,
			positionals: { name: positionalSpec },
			run(_ctx, request) {
				type Request = typeof request;
				const checks: [
					Assert<IsAny<Request> extends false ? true : false>,
					Assert<IsEqual<Request, { name: string; retries: number }>>,
				] = [true, true];
				void checks;
				// @ts-expect-error missing is not part of the command schema
				void request.missing;
				return ok(`${request.name}:${request.retries}`);
			},
		},
	],
});

const commandlessExtension = defineExtension({});

const textGenerator: TextGenerator = {
	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		return { ok: true, text: request.prompt };
	},
};

const execResult: ExecResult = { code: 0, stdout: "ok", stderr: "", killed: false };
const commandOk: boolean = execResult.code === 0 && !execResult.killed;
const successfulResult: NsResult = ok("done");
const failedResult: NsResult = failed("nope", 2);
const notifyLevel: NsNotifyLevel = "info";
const messageOptions: NsCommandMessageOptions = { level: notifyLevel, details: { ok: true } };
const commandIo: NsCommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
	clearPhase: () => {},
};
const progressEvent: NsProgressPhaseEvent = { type: "phase-started", phaseKey: "test" };
const matrixCellState: NsProgressMatrixCellState = "active";
const matrixColumn: NsProgressMatrixColumnInfo = { key: "merge", label: "Merge", width: 6 };
const matrixRow: NsProgressMatrixRowInfo = { rowKey: "feature-a", label: "feature-a (#1)" };
const matrixEvents: NsProgressPhaseEvent[] = [
	{ type: "matrix-declared", columns: [matrixColumn], labelHeader: "Branch / PR" },
	{ type: "matrix-rows", rows: [matrixRow] },
	{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: matrixCellState },
	{ type: "matrix-cell", rowKey: "feature-a", columnKey: "merge", state: "done", text: "ok" },
	{ type: "matrix-note", text: "merging…" },
	{ type: "matrix-running", commands: ["gh pr merge 1"] },
];
const progressListener: NsProgressPhaseListener = (_event) => {};
const progress: NsProgress = { isLive: true, phase: progressListener };

function acceptsExtensionApi(api: NsExtensionApi): string {
	api.commandIo.notify("checked");
	api.progress.phase(progressEvent);
	return api.cwd;
}

void commandRequestChecks;
void manifestCommand;
void packageManifest;
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
void progress;
void acceptsExtensionApi;
