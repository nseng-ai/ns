import { defineExtension, failed, ok, z } from "@ji/kernel/sdk";
import type {
	ExecResult,
	PositionalSpec,
	SdlExtensionManifest,
	SdlExtensionManifestCommand,
	SdlExtensionPackageManifest,
	SdlCommandIo,
	SdlCommandMessageOptions,
	SdlCommandRequest,
	SdlExtensionApi,
	SdlNotifyLevel,
	SdlProgress,
	SdlProgressPhaseEvent,
	SdlProgressPhaseListener,
	SdlResult,
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@ji/kernel/sdk";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const commandSchema = z.object({
	name: z.string(),
	retries: z.number().int().default(0),
});

type CommandRequest = SdlCommandRequest<typeof commandSchema>;
type CommandRequestChecks = [
	Assert<IsAny<CommandRequest> extends false ? true : false>,
	Assert<IsEqual<CommandRequest, { name: string; retries: number }>>,
];

const commandRequestChecks: CommandRequestChecks = [true, true];
const positionalSpec: PositionalSpec = { position: 0 };
const manifestCommand: SdlExtensionManifestCommand = {
	name: "changes",
	path: ["flow", "changes"],
	description: "Show changes.",
	entry: "./src/changes.ts",
};
const manifest: SdlExtensionManifest = { group: "flow", commands: [manifestCommand] };
const packageManifest: SdlExtensionPackageManifest = {
	description: "Flow commands.",
	ji: manifest,
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
const successfulResult: SdlResult = ok("done");
const failedResult: SdlResult = failed("nope", 2);
const notifyLevel: SdlNotifyLevel = "info";
const messageOptions: SdlCommandMessageOptions = { level: notifyLevel, details: { ok: true } };
const commandIo: SdlCommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
	clearPhase: () => {},
};
const progressEvent: SdlProgressPhaseEvent = { type: "phase-started", phaseKey: "test" };
const progressListener: SdlProgressPhaseListener = (_event) => {};
const progress: SdlProgress = { phase: progressListener };

function acceptsExtensionApi(api: SdlExtensionApi): string {
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
void progress;
void acceptsExtensionApi;
