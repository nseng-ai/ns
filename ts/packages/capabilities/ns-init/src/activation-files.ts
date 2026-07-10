import type { NsInitErrorInfo } from "./error-info.ts";

export type ActivationTextFileReadResult =
	| { readonly type: "found"; readonly content: string }
	| { readonly type: "missing" }
	| { readonly type: "not-file" }
	| { readonly type: "error"; readonly error: NsInitErrorInfo };

export type ConsumerDirectoryInspectionResult =
	| { readonly type: "missing" }
	| { readonly type: "directory"; readonly gitkeep: "missing" | "file" | "not-file" }
	| { readonly type: "not-directory" }
	| { readonly type: "error"; readonly error: NsInitErrorInfo };

export type ActivationFilesOperationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: NsInitErrorInfo };

export interface ActivationPathParams {
	readonly repoRoot: string;
	readonly relativePath: string;
}

export interface WriteActivationTextFileParams extends ActivationPathParams {
	readonly content: string;
}

export interface ActivationFilesGateway {
	readTextFile(params: ActivationPathParams): Promise<ActivationTextFileReadResult>;
	inspectConsumerDirectory(
		params: ActivationPathParams,
	): Promise<ConsumerDirectoryInspectionResult>;
	writeTextFile(params: WriteActivationTextFileParams): Promise<ActivationFilesOperationResult>;
	ensureConsumerDirectory(params: ActivationPathParams): Promise<ActivationFilesOperationResult>;
}
