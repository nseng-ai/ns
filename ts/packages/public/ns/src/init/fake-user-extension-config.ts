import type {
	ExpectedUserExtensionConfigState,
	UserExtensionConfigGateway,
	UserExtensionConfigReadResult,
	UserExtensionConfigWriteResult,
} from "./user-extension-config.ts";

export interface InMemoryUserExtensionConfigState {
	readonly configPath?: string;
	readonly content?: string;
	readonly notFile?: boolean;
	readonly readError?: { readonly code: string; readonly message: string };
	readonly mutateBeforeWriteTo?: string;
}

export class InMemoryUserExtensionConfigGateway implements UserExtensionConfigGateway {
	private content: string | undefined;
	private readonly state: InMemoryUserExtensionConfigState;
	private hasMutated = false;
	readonly writes: string[] = [];

	constructor(state: InMemoryUserExtensionConfigState = {}) {
		this.state = state;
		this.content = state.content;
	}

	async read(): Promise<UserExtensionConfigReadResult> {
		const configPath = this.state.configPath ?? "/home/test/.config/ns/ns.toml";
		const configDir = configPath.slice(0, configPath.lastIndexOf("/"));
		if (this.state.readError !== undefined) {
			return { type: "error", configPath, error: { ...this.state.readError, path: configPath } };
		}
		if (this.state.notFile === true) return { type: "not-file", configPath, configDir };
		if (this.content === undefined) return { type: "missing", configPath, configDir };
		return { type: "file", configPath, configDir, content: this.content };
	}

	async compareAndWrite(options: {
		readonly expected: ExpectedUserExtensionConfigState;
		readonly content: string;
	}): Promise<UserExtensionConfigWriteResult> {
		if (!this.hasMutated && this.state.mutateBeforeWriteTo !== undefined) {
			this.content = this.state.mutateBeforeWriteTo;
			this.hasMutated = true;
		}
		const currentMatches =
			options.expected.type === "missing"
				? this.content === undefined
				: this.content === options.expected.content;
		if (!currentMatches) {
			return {
				ok: false,
				error: {
					code: "user-config-prepared-state-mismatch",
					message: "User extension config changed after preparation; refusing to overwrite it.",
					path: this.state.configPath ?? "/home/test/.config/ns/ns.toml",
				},
			};
		}
		this.content = options.content;
		this.writes.push(options.content);
		return { ok: true };
	}

	fileContent(): string | undefined {
		return this.content;
	}
}
