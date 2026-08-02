import type { XdgPathError } from "@nseng-ai/foundation/xdg-path";

export type UserExtensionConfigReadResult =
	| { readonly type: "missing"; readonly configPath: string; readonly configDir: string }
	| {
			readonly type: "file";
			readonly configPath: string;
			readonly configDir: string;
			readonly content: string;
	  }
	| { readonly type: "not-file"; readonly configPath: string; readonly configDir: string }
	| {
			readonly type: "error";
			readonly configPath?: string;
			readonly error: { readonly code: string; readonly message: string; readonly path?: string };
	  };

export type ExpectedUserExtensionConfigState =
	| { readonly type: "missing" }
	| { readonly type: "file"; readonly content: string };

export type UserExtensionConfigWriteResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly error: { readonly code: string; readonly message: string; readonly path: string };
	  };

export interface UserExtensionConfigGateway {
	read(): Promise<UserExtensionConfigReadResult>;
	compareAndWrite(options: {
		readonly expected: ExpectedUserExtensionConfigState;
		readonly content: string;
	}): Promise<UserExtensionConfigWriteResult>;
}

export function userConfigPathError(error: XdgPathError): UserExtensionConfigReadResult {
	return {
		type: "error",
		error: { code: `user-config-${error.code}`, message: error.message },
	};
}
