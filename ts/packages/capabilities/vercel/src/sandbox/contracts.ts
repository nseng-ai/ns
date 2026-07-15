/** A command executed inside a Vercel Sandbox. */
export interface SandboxCommand {
	readonly cmd: string;
	readonly args: readonly string[];
}

/** Names safe to journal and use for later Sandbox reattachment. */
export function isSafeSandboxName(name: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name);
}
