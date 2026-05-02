import {
	createAgentSession,
	createReadOnlyTools,
	DefaultResourceLoader,
	defineTool,
	type ExtensionAPI,
	type ModelRegistry,
	getAgentDir,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import { Type } from "typebox";

type TextPart = { type: "text"; text: string };
type ContentPart = TextPart | { type: string; [key: string]: unknown };
type MessageWithContent = { role?: string; content?: string | ContentPart[] };

const DEFAULT_FETCH_MAX_BYTES = 1_000_000;
const HARD_FETCH_MAX_BYTES = 5_000_000;

const fetchUrlTool = defineTool({
	name: "fetch_url",
	label: "Fetch URL",
	description: "Download text content from an http(s) URL for documentation and reference lookup.",
	parameters: Type.Object({
		url: Type.String({ description: "http(s) URL to fetch" }),
		maxBytes: Type.Optional(
			Type.Number({
				description: `Maximum response bytes to read. Defaults to ${DEFAULT_FETCH_MAX_BYTES}. Hard cap is ${HARD_FETCH_MAX_BYTES}.`,
			}),
		),
	}),
	async execute(_toolCallId, params, signal) {
		let url: URL;
		try {
			url = new URL(params.url);
		} catch {
			return {
				content: [{ type: "text", text: `Invalid URL: ${params.url}` }],
				details: {},
				isError: true,
			};
		}

		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return {
				content: [{ type: "text", text: `Unsupported URL protocol: ${url.protocol}` }],
				details: {},
				isError: true,
			};
		}

		const maxBytes = Math.min(
			Math.max(1, Math.floor(params.maxBytes ?? DEFAULT_FETCH_MAX_BYTES)),
			HARD_FETCH_MAX_BYTES,
		);
		const response = await fetch(url, {
			redirect: "follow",
			signal,
			headers: { "user-agent": "pi-task-extension/0.1" },
		});
		const contentType = response.headers.get("content-type") ?? "unknown";

		if (!response.ok) {
			return {
				content: [{ type: "text", text: `Fetch failed: HTTP ${response.status} ${response.statusText}` }],
				details: { url: url.toString(), status: response.status, contentType },
				isError: true,
			};
		}

		if (!response.body) {
			return {
				content: [{ type: "text", text: "Fetch failed: response body is empty" }],
				details: { url: url.toString(), status: response.status, contentType },
				isError: true,
			};
		}

		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		let truncated = false;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			const remaining = maxBytes - totalBytes;
			if (value.byteLength > remaining) {
				chunks.push(value.slice(0, Math.max(0, remaining)));
				totalBytes = maxBytes;
				truncated = true;
				await reader.cancel();
				break;
			}

			chunks.push(value);
			totalBytes += value.byteLength;
		}

		const bytes = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}

		const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
		const header = [`URL: ${url.toString()}`, `Status: ${response.status}`, `Content-Type: ${contentType}`];
		if (truncated) header.push(`Truncated: first ${maxBytes} bytes`);

		return {
			content: [{ type: "text", text: `${header.join("\n")}\n\n${text}` }],
			details: { url: url.toString(), status: response.status, contentType, bytes: totalBytes, truncated },
		};
	},
});

function extractText(content: MessageWithContent["content"]): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.filter((part): part is TextPart => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("");
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

async function runTask(options: {
	prompt: string;
	cwd: string;
	model?: Model<any>;
	modelRegistry?: ModelRegistry;
	signal?: AbortSignal;
}): Promise<string> {
	const { prompt, cwd, model, modelRegistry, signal } = options;
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir: getAgentDir(),
		noExtensions: true,
	});
	await loader.reload();

	const { session } = await createAgentSession({
		cwd,
		model,
		modelRegistry,
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(cwd),
		tools: createReadOnlyTools(cwd),
		customTools: [fetchUrlTool],
	});

	let finalText = "";
	const unsubscribe = session.subscribe((event) => {
		if (event.type === "message_end" && event.message?.role === "assistant") {
			finalText = extractText((event.message as MessageWithContent).content);
		}
	});

	const abortChild = () => {
		void session.abort();
	};

	if (signal?.aborted) {
		session.dispose();
		throw new Error("Task was aborted");
	}
	if (signal) signal.addEventListener("abort", abortChild, { once: true });

	try {
		await session.prompt(prompt, { source: "extension" });
		return finalText;
	} finally {
		if (signal) signal.removeEventListener("abort", abortChild);
		unsubscribe();
		session.dispose();
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("task", {
		description: "Run a one-shot LM task with read-only filesystem and web-fetch access. Usage: /task <prompt>",
		async handler(args, ctx) {
			const prompt = args.trim();
			if (!prompt) {
				ctx.ui.notify("Usage: /task <prompt>", "warning");
				return;
			}

			ctx.ui.setStatus("task", "task running…");
			try {
				const output = await runTask({
					prompt,
					cwd: ctx.cwd,
					model: ctx.model,
					modelRegistry: ctx.modelRegistry,
				});
				pi.sendUserMessage(`**Task result**\n\n${output || "(no output)"}`, { deliverAs: "followUp" });
			} catch (error) {
				pi.sendUserMessage(`**Task failed**\n\n${formatError(error)}`, { deliverAs: "followUp" });
			} finally {
				ctx.ui.setStatus("task", undefined);
			}
		},
	});

	pi.registerTool({
		name: "task",
		label: "Task",
		description: "Run a one-shot LM task with read-only filesystem and web-fetch access, then return its final answer.",
		promptSnippet: "Run an isolated child LM task that can inspect files read-only and fetch web documentation.",
		promptGuidelines: [
			"Use task for bounded research, second opinions, summarization, critique, or documentation lookup when an isolated child context would help.",
			"The task child can read, grep, find, and list project files, and can use fetch_url to download http(s) documentation; it cannot edit files or run shell commands.",
			"Include enough context in the task prompt for the child to work independently, including relevant paths or URLs when known.",
		],
		parameters: Type.Object({
			prompt: Type.String({ description: "Prompt to run in the child task session" }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const output = await runTask({
					prompt: params.prompt,
					cwd: ctx.cwd,
					model: ctx.model,
					modelRegistry: ctx.modelRegistry,
					signal,
				});
				return {
					content: [{ type: "text", text: output || "(no output)" }],
					details: {},
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `Task failed: ${formatError(error)}` }],
					details: {},
					isError: true,
				};
			}
		},
	});
}
