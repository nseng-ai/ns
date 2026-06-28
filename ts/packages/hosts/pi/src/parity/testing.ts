import type { LivePiSurface } from "./check.ts";

interface RegisteredToolLike {
	readonly name?: unknown;
}

/** Test host that records Pi command/tool registrations for parity checks. */
export class FakePiSurfaceHost {
	private readonly registeredSurfaces: LivePiSurface[] = [];
	private readonly surfaceKeys = new Set<string>();
	readonly messageRenderers = new Map<string, unknown>();
	readonly events: string[] = [];

	registerCommand(name: string, _options: unknown): void {
		this.recordSurface({ kind: "command", surface: name });
	}

	registerTool(definition: RegisteredToolLike): void {
		if (typeof definition.name !== "string" || definition.name.length === 0) {
			throw new Error("registered tool definition is missing a non-empty name");
		}
		this.recordSurface({ kind: "tool", surface: definition.name });
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.messageRenderers.set(customType, renderer);
	}

	on(event: string, _handler: unknown): void {
		this.events.push(event);
	}

	async exec(): Promise<never> {
		throw new Error("unexpected exec during Pi extension registration");
	}

	getCommands(): readonly unknown[] {
		return [];
	}

	sendMessage(): void {}

	sendUserMessage(): void {}

	stop(): void {}

	async setModel(): Promise<boolean> {
		throw new Error("unexpected setModel during Pi extension registration");
	}

	getThinkingLevel(): "off" {
		return "off";
	}

	surfaces(): LivePiSurface[] {
		return [...this.registeredSurfaces];
	}

	private recordSurface(surface: LivePiSurface): void {
		const key = `${surface.kind}:${surface.surface}`;
		if (this.surfaceKeys.has(key)) {
			throw new Error(`duplicate ${surface.kind} registration: ${surface.surface}`);
		}
		this.surfaceKeys.add(key);
		this.registeredSurfaces.push(surface);
	}
}

export async function registerWithFakeHost<TPi>(
	pi: FakePiSurfaceHost,
	register: (pi: TPi) => void | Promise<void>,
): Promise<void> {
	await register(pi as TPi);
}
