import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface CodexStructuredOutputHandle {
	readonly schemaPath: string;
	readonly outputPath: string;
}

export interface CodexStructuredOutputFiles {
	prepare(schema: Readonly<Record<string, unknown>>): Promise<CodexStructuredOutputHandle>;
	readOutput(handle: CodexStructuredOutputHandle): Promise<string>;
	cleanup(handle: CodexStructuredOutputHandle): Promise<void>;
}

export class RealCodexStructuredOutputFiles implements CodexStructuredOutputFiles {
	async prepare(schema: Readonly<Record<string, unknown>>): Promise<CodexStructuredOutputHandle> {
		const directory = await mkdtemp(join(tmpdir(), "ns-reviews-codex-"));
		const handle = {
			schemaPath: join(directory, "structured-output.schema.json"),
			outputPath: join(directory, "structured-output.json"),
		};
		try {
			await writeFile(handle.schemaPath, JSON.stringify(schema), "utf8");
			return handle;
		} catch (error) {
			try {
				await rm(directory, { recursive: true, force: true });
			} catch {
				// Preserve the schema-write failure; no usable handle exists for caller cleanup.
			}
			throw error;
		}
	}

	async readOutput(handle: CodexStructuredOutputHandle): Promise<string> {
		return await readFile(handle.outputPath, "utf8");
	}

	async cleanup(handle: CodexStructuredOutputHandle): Promise<void> {
		await rm(dirname(handle.schemaPath), { recursive: true, force: true });
	}
}

export interface InMemoryCodexStructuredOutputFilesOptions {
	readonly output?: string;
	readonly prepareError?: Error;
	readonly readError?: Error;
	readonly cleanupError?: Error;
}

export class InMemoryCodexStructuredOutputFiles implements CodexStructuredOutputFiles {
	private readonly output: string;
	private readonly prepareError: Error | undefined;
	private readonly readError: Error | undefined;
	private readonly cleanupError: Error | undefined;
	private preparedSchemaInternal: Readonly<Record<string, unknown>> | null = null;
	private isCleanedInternal = false;

	constructor(options: InMemoryCodexStructuredOutputFilesOptions = {}) {
		this.output = options.output ?? "{}";
		this.prepareError = options.prepareError;
		this.readError = options.readError;
		this.cleanupError = options.cleanupError;
	}

	async prepare(schema: Readonly<Record<string, unknown>>): Promise<CodexStructuredOutputHandle> {
		if (this.prepareError !== undefined) throw this.prepareError;
		this.preparedSchemaInternal = structuredClone(schema);
		this.isCleanedInternal = false;
		return {
			schemaPath: "/memory/structured-output.schema.json",
			outputPath: "/memory/structured-output.json",
		};
	}

	async readOutput(_handle: CodexStructuredOutputHandle): Promise<string> {
		if (this.readError !== undefined) throw this.readError;
		return this.output;
	}

	async cleanup(_handle: CodexStructuredOutputHandle): Promise<void> {
		this.isCleanedInternal = true;
		if (this.cleanupError !== undefined) throw this.cleanupError;
	}

	preparedSchema(): Readonly<Record<string, unknown>> | null {
		return this.preparedSchemaInternal === null
			? null
			: structuredClone(this.preparedSchemaInternal);
	}

	isCleaned(): boolean {
		return this.isCleanedInternal;
	}
}
