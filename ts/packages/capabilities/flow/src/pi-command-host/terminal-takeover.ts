export interface ProcessExitEvents {
	onExit(handler: () => void): void;
	offExit(handler: () => void): void;
}

export interface TerminalTakeover {
	enter(): void;
	restore(): void;
	complete(): void;
}

export type TerminalTakeoverFactory = () => TerminalTakeover;

const ENTER_ALTERNATE_SCREEN = "\u001b[?1049h\u001b[H\u001b[2J";
const LEAVE_ALTERNATE_SCREEN = "\u001b[?1049l";

export function createTerminalTakeover(options: {
	write(value: string): void;
	exitEvents: ProcessExitEvents;
}): TerminalTakeover {
	let state: "idle" | "entered" | "restored" = "idle";
	let isCompleted = false;
	const restoreOnExit = (): void => restore();

	function enter(): void {
		if (state !== "idle") return;
		// Take ownership before writing: a writer may partially emit the escape
		// sequence and then throw, in which case the host must still be able to restore.
		state = "entered";
		options.write(ENTER_ALTERNATE_SCREEN);
		options.exitEvents.onExit(restoreOnExit);
	}

	function restore(): void {
		if (state !== "entered") return;
		state = "restored";
		options.exitEvents.offExit(restoreOnExit);
		options.write(LEAVE_ALTERNATE_SCREEN);
	}

	return {
		enter,
		restore,
		complete(): void {
			if (isCompleted || state === "idle") return;
			if (state === "entered") restore();
			isCompleted = true;
			options.write("stack view closed\n");
		},
	};
}

export function createRealTerminalTakeover(): TerminalTakeover {
	return createTerminalTakeover({
		write: (value) => process.stdout.write(value),
		exitEvents: {
			onExit: (handler) => process.on("exit", handler),
			offExit: (handler) => process.off("exit", handler),
		},
	});
}
