import { defaultCommandResolver, type CommandPrefix, type CommandResolver } from "@asdl/core/exec";

export { defaultCommandResolver, type CommandResolver };

export function resolveVercelCommandPrefix(resolveCommand: CommandResolver): CommandPrefix | undefined {
	const vercel = resolveCommand("vercel");
	if (vercel !== undefined) {
		return { command: vercel, args: [] };
	}

	const pnpm = resolveCommand("pnpm");
	if (pnpm !== undefined) {
		return { command: pnpm, args: ["dlx", "vercel@latest"] };
	}

	return undefined;
}
