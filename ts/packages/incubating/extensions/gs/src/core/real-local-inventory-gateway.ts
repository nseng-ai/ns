import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { GitGateway } from "@nseng-ai/foundation/git";

import type {
	GsLocalInventoryGateway,
	GsLocalInventoryOptions,
	GsLocalInventoryResult,
} from "./local-inventory.ts";
import { parseGsLocalState } from "./local-state.ts";

export type GsLocalInventoryGitGateway = Pick<GitGateway, "gitCommonDir">;

export type GsStateReadResult =
	| { readonly type: "found"; readonly contents: string }
	| { readonly type: "missing" }
	| { readonly type: "failure"; readonly message: string };

export interface GsStateReader {
	readState(path: string): Promise<GsStateReadResult>;
}

export interface RealGsLocalInventoryGatewayOptions {
	readonly git: GsLocalInventoryGitGateway;
	readonly stateReader?: GsStateReader;
}

export class RealGsLocalInventoryGateway implements GsLocalInventoryGateway {
	private readonly git: GsLocalInventoryGitGateway;
	private readonly stateReader: GsStateReader;

	constructor(options: RealGsLocalInventoryGatewayOptions) {
		this.git = options.git;
		this.stateReader = options.stateReader ?? new NodeGsStateReader();
	}

	async readLocalInventory(options: GsLocalInventoryOptions): Promise<GsLocalInventoryResult> {
		let commonDirResult;
		try {
			commonDirResult = await this.git.gitCommonDir({ cwd: options.cwd });
		} catch (error) {
			return gitUnavailable(messageFromUnknown(error));
		}
		if (!commonDirResult.ok) return gitUnavailable(commonDirResult.error.message);

		let stateRead;
		try {
			stateRead = await this.stateReader.readState(join(commonDirResult.value, "gh-stack"));
		} catch (error) {
			return stateReadFailed(messageFromUnknown(error));
		}
		if (stateRead.type === "missing") return { ok: true, value: { stacks: [] } };
		if (stateRead.type === "failure") return stateReadFailed(stateRead.message);

		let rawState: unknown;
		try {
			rawState = JSON.parse(stateRead.contents);
		} catch (error) {
			return stateUnsupported(
				`Local gh-stack state is not valid JSON: ${messageFromUnknown(error)}`,
			);
		}

		const parsed = parseGsLocalState(rawState);
		if (!parsed.ok) return stateUnsupported(parsed.message);
		return { ok: true, value: parsed.value };
	}
}

export class NodeGsStateReader implements GsStateReader {
	async readState(path: string): Promise<GsStateReadResult> {
		try {
			return { type: "found", contents: await readFile(path, "utf8") };
		} catch (error) {
			if (isNodeErrorWithCode(error, "ENOENT")) return { type: "missing" };
			return { type: "failure", message: messageFromUnknown(error) };
		}
	}
}

function gitUnavailable(detail: string): GsLocalInventoryResult {
	return {
		ok: false,
		error: {
			type: "git-repository-unavailable",
			message: `Git repository is unavailable: ${detail}`,
		},
	};
}

function stateReadFailed(detail: string): GsLocalInventoryResult {
	return {
		ok: false,
		error: {
			type: "gh-stack-state-read-failed",
			message: `Could not read local gh-stack state: ${detail}`,
		},
	};
}

function stateUnsupported(detail: string): GsLocalInventoryResult {
	return {
		ok: false,
		error: {
			type: "gh-stack-state-unsupported",
			message: detail,
		},
	};
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
