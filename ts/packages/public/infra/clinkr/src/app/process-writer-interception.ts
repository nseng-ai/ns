export interface ProcessWriterSinks {
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
}

let interceptionActive = false;

/**
 * Runs an action while selected process writers forward normalized UTF-8 text
 * to caller-provided sinks. Interception is process-global, so calls must be
 * awaited sequentially; overlapping or nested calls fail before changing a writer.
 */
export async function withInterceptedProcessWriters<T>(
	sinks: ProcessWriterSinks,
	action: () => T | Promise<T>,
): Promise<T> {
	if (sinks.stdout === undefined && sinks.stderr === undefined) {
		throw new Error("Process-writer interception requires at least one stdout or stderr sink");
	}
	if (interceptionActive) {
		throw new Error(
			"Process-writer interception is process-global and cannot overlap or nest; await each intercepted run sequentially",
		);
	}

	interceptionActive = true;
	const originalStdoutWrite = process.stdout.write;
	const originalStderrWrite = process.stderr.write;
	try {
		if (sinks.stdout !== undefined) {
			process.stdout.write = writerForSink(sinks.stdout) as typeof process.stdout.write;
		}
		if (sinks.stderr !== undefined) {
			process.stderr.write = writerForSink(sinks.stderr) as typeof process.stderr.write;
		}
		return await action();
	} finally {
		if (sinks.stdout !== undefined) process.stdout.write = originalStdoutWrite;
		if (sinks.stderr !== undefined) process.stderr.write = originalStderrWrite;
		interceptionActive = false;
	}
}

function writerForSink(sink: (text: string) => void) {
	return (chunk: string | Uint8Array): boolean => {
		sink(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	};
}
