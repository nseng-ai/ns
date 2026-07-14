/**
 * Admit sandbox names safe to carry across durable workflow steps and
 * later reattachment or cleanup operations.
 */
export function isSafeSandboxName(name: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name);
}
