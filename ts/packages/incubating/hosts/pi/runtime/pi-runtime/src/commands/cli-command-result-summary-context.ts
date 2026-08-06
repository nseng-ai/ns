import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import { writeCliCommandResultLogs } from "./cli-command-result-log-writer.ts";
import type {
	GenerateCliCommandResultSummary,
	WriteCliCommandResultLogs,
} from "./cli-command-result-summary.ts";
import { callPiModelText, type PiModelRegistryLike } from "../kit/models/call.ts";

const CLI_COMMAND_RESULT_SUMMARY_MAX_TOKENS = 512;
const CLI_COMMAND_RESULT_SUMMARY_TIMEOUT_MS = 120_000;
const CLI_COMMAND_RESULT_SUMMARY_SYSTEM_PROMPT =
	"You summarize executed CLI command results. Follow the requested Markdown grammar exactly and report only facts supported by the supplied command metadata and output.";

export interface CliCommandResultSummaryGitGateway {
	repoRoot(request: {
		cwd: string;
	}): Promise<
		| { readonly ok: true; readonly value: string }
		| { readonly ok: false; readonly error: { readonly message: string } }
	>;
}

export interface PiCommandModelRegistry {
	find(provider: string, modelId: string): unknown | undefined;
	getApiKeyAndHeaders?: PiModelRegistryLike["getApiKeyAndHeaders"];
}

export interface CliCommandResultSummaryContext {
	readonly writeLogs: WriteCliCommandResultLogs;
	selectModel(
		cwd: string,
	): Promise<
		| { readonly ok: true; readonly modelSelection: ModelSelection }
		| { readonly ok: false; readonly message: string }
	>;
	generateSummary(
		registry: PiCommandModelRegistry,
		request: Parameters<GenerateCliCommandResultSummary>[0],
	): ReturnType<GenerateCliCommandResultSummary>;
}

export function createRealCliCommandResultSummaryContext(options: {
	readonly git: CliCommandResultSummaryGitGateway;
}): CliCommandResultSummaryContext {
	return {
		writeLogs: writeCliCommandResultLogs,
		async selectModel(cwd) {
			const repository = await options.git.repoRoot({ cwd });
			if (!repository.ok) return { ok: false, message: repository.error.message };
			const policy = loadModelPolicy({
				repoRoot: repository.value,
				gateway: nodeProjectConfigGateway,
			});
			if (!policy.ok) return { ok: false, message: policy.error.message };
			const resolved = resolveModelOperation(
				policy.value,
				MODEL_OPERATION_IDS.piCliCommandResultSummary,
			);
			if (!resolved.ok) return { ok: false, message: resolved.error.message };
			return { ok: true, modelSelection: resolved.value.selection };
		},
		async generateSummary(registry, request) {
			if (registry.getApiKeyAndHeaders === undefined) {
				return { ok: false, message: "Pi model authentication is unavailable in this host." };
			}
			const modelRegistry: PiModelRegistryLike = {
				find: registry.find.bind(registry),
				getApiKeyAndHeaders: registry.getApiKeyAndHeaders.bind(registry),
			};
			const result = await callPiModelText({
				registry: modelRegistry,
				modelSelection: request.modelSelection,
				systemPrompt: CLI_COMMAND_RESULT_SUMMARY_SYSTEM_PROMPT,
				userText: request.prompt,
				maxTokens: CLI_COMMAND_RESULT_SUMMARY_MAX_TOKENS,
				timeoutMs: CLI_COMMAND_RESULT_SUMMARY_TIMEOUT_MS,
			});
			if (!result.ok) {
				return {
					ok: false,
					message: result.message ?? `Model call failed: ${result.reason}`,
				};
			}
			return { ok: true, text: result.text };
		},
	};
}
