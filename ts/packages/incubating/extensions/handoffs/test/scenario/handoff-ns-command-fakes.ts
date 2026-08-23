import { FakeBrmemGateway, type BrmemSourceReader, type SourceBytesResult } from "@nseng-ai/brmem";
import { usageError, type ClinkrExit, type ClinkrInteraction } from "@nseng-ai/clinkr";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsCommand,
	NsCommandSchema,
	NsExecOptions,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";

import { HANDOFF_NAMESPACE } from "../../src/core/identity.ts";

export interface FakeHandoffNsApiOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	brmem?: FakeBrmemGateway;
	git?: InMemoryGitGateway;
	sourceReader?: BrmemSourceReader;
	interaction?: ClinkrInteraction;
	stderr?: (text: string) => void;
}

export class FakeHandoffNsApi implements NsExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly extensions: Readonly<Record<string, unknown>>;
	readonly stderrChunks: string[] = [];
	readonly execCalls: Array<{
		command: string;
		args: string[];
		options: NsExecOptions | undefined;
	}> = [];
	readonly textGeneratorCalls: TextGenerationRequest[] = [];
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	readonly stderr: (text: string) => void;

	constructor(options: FakeHandoffNsApiOptions = {}) {
		const brmem = options.brmem ?? new FakeBrmemGateway();
		const git = options.git ?? new InMemoryGitGateway({ currentBranch: "main" });
		this.cwd = options.cwd ?? "/work";
		this.env = { HOME: "/home/ns-test", ...(options.env ?? {}) };
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

	async exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		throw new Error(
			`Unexpected exec call in handoff ns command test: ${[command, ...args].join(" ")}`,
		);
	}

	readonly textGenerator = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.textGeneratorCalls.push({ ...request });
			throw new Error("Unexpected text-generation call in handoff ns command test.");
		},
	};
}

export function createFakeHandoffNsApi(options: FakeHandoffNsApiOptions = {}): FakeHandoffNsApi {
	return new FakeHandoffNsApi(options);
}

export async function runHandoffCommand<S extends NsCommandSchema, T extends {}, N, F, U>(
	command: NsCommand<S, T, N, F, U>,
	request: unknown,
	options: { api?: NsExtensionApi } = {},
): Promise<ClinkrExit<T, N, F, U>> {
	if (!("handler" in command)) throw new Error(`Command  has no handler.`);
	const parsed = command.schema.safeParse(request);
	if (!parsed.success) return usageError(parsed.error.message) as ClinkrExit<T, N, F, U>;
	const exit = await command.handler(options.api ?? createFakeHandoffNsApi(), parsed.data);
	if (!isClinkrExit<T, N, F, U>(exit)) {
		throw new Error(
			`Command ${command.name} returned a legacy ns result instead of a Clinkr exit.`,
		);
	}
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
		isInteractive?: boolean;
		confirmations?: ReadonlyArray<"confirmed" | "declined" | "aborted">;
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

	constructor(options: { stdin?: string; files?: Readonly<Record<string, string>> } = {}) {
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

function isClinkrExit<T, N, F, U>(value: unknown): value is ClinkrExit<T, N, F, U> {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return type === "ok" || type === "negative" || type === "failure" || type === "usageError";
}
