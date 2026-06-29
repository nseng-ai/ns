import { FakeBrmemGateway, type BrmemSourceReader, type SourceBytesResult } from "@sdl/brmem";
import { usageError, type ClinkrExit, type ClinkrInteraction } from "@sdl/clinkr";
import { InMemoryGitGateway } from "@sdl/capability-kit/git/testing";
import { noopSdlCommandIo, noopSdlProgress } from "sdl-sdk";
import type {
	ExecResult,
	SdlCommand,
	SdlCommandSchema,
	SdlExecOptions,
	SdlExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "sdl-sdk";

import { HANDOFF_NAMESPACE } from "../../src/identity.ts";

export interface FakeHandoffSdlApiOptions {
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
	brmem?: FakeBrmemGateway | undefined;
	git?: InMemoryGitGateway | undefined;
	sourceReader?: BrmemSourceReader | undefined;
	interaction?: ClinkrInteraction | undefined;
	stderr?: ((text: string) => void) | undefined;
}

export class FakeHandoffSdlApi implements SdlExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly extensions: Readonly<Record<string, unknown>>;
	readonly stderrChunks: string[] = [];
	readonly execCalls: Array<{
		command: string;
		args: string[];
		options: SdlExecOptions | undefined;
	}> = [];
	readonly textGeneratorCalls: TextGenerationRequest[] = [];
	readonly commandIo = noopSdlCommandIo;
	readonly progress = noopSdlProgress;
	readonly stderr: (text: string) => void;

	constructor(options: FakeHandoffSdlApiOptions = {}) {
		const brmem = options.brmem ?? new FakeBrmemGateway();
		const git = options.git ?? new InMemoryGitGateway({ currentBranch: "main" });
		this.cwd = options.cwd ?? "/work";
		this.env = { HOME: "/home/sdl-test", ...(options.env ?? {}) };
		this.stderr = (text) => {
			this.stderrChunks.push(text);
			options.stderr?.(text);
		};
		this.extensions = {
			handoff: {
				brmem,
				git,
				...(options.sourceReader === undefined ? {} : { sourceReader: options.sourceReader }),
				...(options.interaction === undefined ? {} : { interaction: options.interaction }),
			},
		};
	}

	async exec(command: string, args: string[], options?: SdlExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		throw new Error(
			`Unexpected exec call in handoff SDL command test: ${[command, ...args].join(" ")}`,
		);
	}

	readonly textGenerator = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.textGeneratorCalls.push({ ...request });
			throw new Error("Unexpected text-generation call in handoff SDL command test.");
		},
	};
}

export function createFakeHandoffSdlApi(options: FakeHandoffSdlApiOptions = {}): FakeHandoffSdlApi {
	return new FakeHandoffSdlApi(options);
}

export async function runHandoffCommand<S extends SdlCommandSchema, T>(
	command: SdlCommand<S, T>,
	request: unknown,
	options: { api?: SdlExtensionApi | undefined } = {},
): Promise<ClinkrExit<T>> {
	if (command.schema === undefined) {
		throw new Error(`Command ${command.name} does not declare a request schema.`);
	}
	const parsed = command.schema.safeParse(request);
	if (!parsed.success) {
		return usageError("Invalid handoff command request.", { issues: parsed.error.issues });
	}
	const exit = await command.run(options.api ?? createFakeHandoffSdlApi(), parsed.data);
	if (!isClinkrExit<T>(exit)) {
		throw new Error(
			`Command ${command.name} returned a legacy SDL result instead of a Clinkr exit.`,
		);
	}
	if (exit.type === "ok") command.resultSchema?.parse(exit.data);
	return exit;
}

export async function putHandoffEntry(
	gateway: FakeBrmemGateway,
	options: { key: string; branch: string; content: string },
): Promise<void> {
	const result = await gateway.putEntry({
		namespace: HANDOFF_NAMESPACE,
		key: options.key,
		branch: options.branch,
		content: options.content,
	});
	if (result.type === "error") throw new Error(result.error.message);
}

export async function getHandoffContent(
	gateway: FakeBrmemGateway,
	options: { key: string; branch: string },
): Promise<string | undefined> {
	const result = await gateway.getEntry({
		namespace: HANDOFF_NAMESPACE,
		key: options.key,
		branch: options.branch,
	});
	if (result.type === "error") throw new Error(result.error.message);
	if (result.type === "missing") return undefined;
	return result.value.content;
}

export function fakeHandoffInteraction(
	options: {
		isInteractive?: boolean | undefined;
		confirmations?: ReadonlyArray<"confirmed" | "declined" | "aborted"> | undefined;
	} = {},
): ClinkrInteraction {
	const confirmations = [...(options.confirmations ?? [])];
	return {
		isInteractive: () => options.isInteractive ?? true,
		confirm: async () => {
			const next = confirmations.shift() ?? "aborted";
			return { type: next };
		},
	};
}

export class FakeHandoffSourceReader implements BrmemSourceReader {
	private readonly stdin: string;
	private readonly files: Readonly<Record<string, string>>;

	constructor(
		options: { stdin?: string | undefined; files?: Readonly<Record<string, string>> } = {},
	) {
		this.stdin = options.stdin ?? "";
		this.files = { ...(options.files ?? {}) };
	}

	async readFileBytes(path: string, _options: { cwd: string }): Promise<SourceBytesResult> {
		const content = this.files[path];
		if (content === undefined) return { type: "missing" };
		return { type: "ok", bytes: new TextEncoder().encode(content) };
	}

	async readStdinBytes(): Promise<Uint8Array> {
		return new TextEncoder().encode(this.stdin);
	}
}

function isClinkrExit<T>(value: unknown): value is ClinkrExit<T> {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return type === "ok" || type === "negative" || type === "failure" || type === "usageError";
}
