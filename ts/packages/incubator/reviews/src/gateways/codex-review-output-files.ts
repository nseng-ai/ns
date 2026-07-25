import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface CodexReviewOutputHandle {
	readonly schemaPath: string;
	readonly outputPath: string;
}

export interface CodexReviewOutputFiles {
	prepare(schema: Readonly<Record<string, unknown>>): Promise<CodexReviewOutputHandle>;
	readOutput(handle: CodexReviewOutputHandle): Promise<string>;
	cleanup(handle: CodexReviewOutputHandle): Promise<void>;
}

export class RealCodexReviewOutputFiles implements CodexReviewOutputFiles {
	async prepare(schema: Readonly<Record<string, unknown>>): Promise<CodexReviewOutputHandle> {
		const directory = await mkdtemp(join(tmpdir(), "ns-reviews-codex-"));
		const handle = {
			schemaPath: join(directory, "findings.schema.json"),
			outputPath: join(directory, "findings.json"),
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

	async readOutput(handle: CodexReviewOutputHandle): Promise<string> {
		return await readFile(handle.outputPath, "utf8");
	}

	async cleanup(handle: CodexReviewOutputHandle): Promise<void> {
		await rm(dirname(handle.schemaPath), { recursive: true, force: true });
	}
}

export interface InMemoryCodexReviewOutputFilesOptions {
	readonly output?: string;
	readonly prepareError?: Error;
	readonly readError?: Error;
	readonly cleanupError?: Error;
}

export class InMemoryCodexReviewOutputFiles implements CodexReviewOutputFiles {
	private readonly output: string;
	private readonly prepareError: Error | undefined;
	private readonly readError: Error | undefined;
	private readonly cleanupError: Error | undefined;
	private preparedSchemaInternal: Readonly<Record<string, unknown>> | null = null;
	private isCleanedInternal = false;

	constructor(options: InMemoryCodexReviewOutputFilesOptions = {}) {
		this.output = options.output ?? '{"findings":[]}';
		this.prepareError = options.prepareError;
		this.readError = options.readError;
		this.cleanupError = options.cleanupError;
	}

	async prepare(schema: Readonly<Record<string, unknown>>): Promise<CodexReviewOutputHandle> {
		if (this.prepareError !== undefined) throw this.prepareError;
		this.preparedSchemaInternal = structuredClone(schema);
		this.isCleanedInternal = false;
		return { schemaPath: "/memory/findings.schema.json", outputPath: "/memory/findings.json" };
	}

	async readOutput(_handle: CodexReviewOutputHandle): Promise<string> {
		if (this.readError !== undefined) throw this.readError;
		return this.output;
	}

	async cleanup(_handle: CodexReviewOutputHandle): Promise<void> {
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
