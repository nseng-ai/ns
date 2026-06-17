import type { RcFilesystem } from "../../src/shell/rc-block.ts";

export class FakeRcFilesystem implements RcFilesystem {
	private readonly files = new Map<string, string>();
	private readonly dirs = new Set<string>();
	private readonly writeLog: Array<{ path: string; text: string }> = [];
	private readonly mkdirLog: string[] = [];

	constructor(initialFiles: Readonly<Record<string, string>> = {}) {
		for (const [path, text] of Object.entries(initialFiles)) {
			this.files.set(path, text);
		}
	}

	async readText(path: string): Promise<{ type: "missing" } | { type: "text"; text: string }> {
		const text = this.files.get(path);
		return text === undefined ? { type: "missing" } : { type: "text", text };
	}

	async writeText(path: string, text: string): Promise<void> {
		this.files.set(path, text);
		this.writeLog.push({ path, text });
	}

	async mkdirp(path: string): Promise<void> {
		this.dirs.add(path);
		this.mkdirLog.push(path);
	}

	readFile(path: string): string | undefined {
		return this.files.get(path);
	}

	writes(): readonly { path: string; text: string }[] {
		return this.writeLog.map((entry) => ({ ...entry }));
	}

	mkdirs(): readonly string[] {
		return [...this.mkdirLog];
	}
}
