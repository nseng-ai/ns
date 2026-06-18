import { promises as fs } from "node:fs";
import path from "node:path";
import {
	EPISODES_FILE_NAME,
	MANIFEST_FILE_NAME,
	MESSAGES_FILE_NAME,
	SYSTEM_PROMPT_FILE_NAME,
	bundleManifestReadSchema,
	type BundleManifestSummary,
	type BundleSnapshot,
	type PersistedBundle,
} from "./bundle.ts";
import { errorMessage } from "./errors.ts";

export type PersistBundleResult =
	| { ok: true; value: PersistedBundle }
	| { ok: false; error: { code: "io-error"; message: string } };

export type WriteEpisodesFileResult =
	| { ok: true; isAlreadyPresent: boolean }
	| { ok: false; error: { code: "not-committed" | "io-error"; message: string } };

export interface BundleStore {
	persistBundle(snapshot: BundleSnapshot): Promise<PersistBundleResult>;
	writeEpisodesFile(options: { bundleDir: string; json: string }): Promise<WriteEpisodesFileResult>;
}

export function createFsBundleStore(options: {
	sessionDir: string;
	sessionId: string;
}): BundleStore {
	return new FsBundleStore(options.sessionDir, options.sessionId);
}

interface CommittedBundleInfo {
	ordinal: number;
	dir: string;
	byteSize: number;
	manifest: BundleManifestSummary;
}

class FsBundleStore implements BundleStore {
	private readonly rootDir: string;
	private queue: Promise<void>;

	constructor(sessionDir: string, sessionId: string) {
		this.rootDir = path.join(sessionDir, "context-profiles", sessionId);
		this.queue = Promise.resolve();
	}

	async persistBundle(snapshot: BundleSnapshot): Promise<PersistBundleResult> {
		return this.enqueue(() => this.persistBundleNow(snapshot));
	}

	async writeEpisodesFile(options: {
		bundleDir: string;
		json: string;
	}): Promise<WriteEpisodesFileResult> {
		try {
			const manifestPath = path.join(options.bundleDir, MANIFEST_FILE_NAME);
			const manifestText = await fs.readFile(manifestPath, "utf8");
			if (!bundleManifestReadSchema.safeParse(JSON.parse(manifestText)).success) {
				return {
					ok: false,
					error: { code: "not-committed", message: "bundle manifest is invalid" },
				};
			}
		} catch (error) {
			return { ok: false, error: { code: "not-committed", message: errorMessage(error) } };
		}

		const finalPath = path.join(options.bundleDir, EPISODES_FILE_NAME);
		const tempPath = path.join(
			options.bundleDir,
			`.episodes.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
		);
		try {
			await fs.writeFile(tempPath, options.json, "utf8");
			try {
				await fs.link(tempPath, finalPath);
			} catch (error) {
				if (isAlreadyExists(error)) {
					await fs.rm(tempPath, { force: true });
					return { ok: true, isAlreadyPresent: true };
				}
				throw error;
			}
			await fs.rm(tempPath, { force: true });
			return { ok: true, isAlreadyPresent: false };
		} catch (error) {
			await fs.rm(tempPath, { force: true }).catch(() => undefined);
			return { ok: false, error: { code: "io-error", message: errorMessage(error) } };
		}
	}

	private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.queue;
		let release: () => void = () => {};
		this.queue = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await operation();
		} finally {
			release();
		}
	}

	private async persistBundleNow(snapshot: BundleSnapshot): Promise<PersistBundleResult> {
		try {
			await fs.mkdir(this.rootDir, { recursive: true });
			const numericOrdinals = await this.listNumericOrdinals();
			const committed = await this.listCommittedBundles(numericOrdinals);
			const latest = committed.at(-1) ?? null;
			const sessionTotalBefore = committed.reduce((total, bundle) => total + bundle.byteSize, 0);
			if (latest !== null && latest.manifest.contentHash === snapshot.manifest.contentHash) {
				return {
					ok: true,
					value: {
						ordinal: latest.ordinal,
						dir: latest.dir,
						byteSize: latest.byteSize,
						sessionTotalBytes: sessionTotalBefore,
						isReused: true,
						manifest: latest.manifest,
					},
				};
			}

			const ordinal = (numericOrdinals.at(-1) ?? 0) + 1;
			const dir = path.join(this.rootDir, String(ordinal));
			const tempDir = path.join(
				this.rootDir,
				`.tmp-${ordinal}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
			);
			const manifestJson = `${JSON.stringify(snapshot.manifest, null, 2)}\n`;
			await fs.mkdir(tempDir, { recursive: false });
			try {
				await fs.writeFile(path.join(tempDir, MESSAGES_FILE_NAME), snapshot.messagesJsonl, "utf8");
				await fs.writeFile(
					path.join(tempDir, SYSTEM_PROMPT_FILE_NAME),
					snapshot.systemPrompt,
					"utf8",
				);
				await fs.writeFile(path.join(tempDir, MANIFEST_FILE_NAME), manifestJson, "utf8");
				await fs.rename(tempDir, dir);
			} catch (error) {
				await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
				throw error;
			}
			const byteSize =
				Buffer.byteLength(snapshot.messagesJsonl) +
				Buffer.byteLength(snapshot.systemPrompt) +
				Buffer.byteLength(manifestJson);
			return {
				ok: true,
				value: {
					ordinal,
					dir,
					byteSize,
					sessionTotalBytes: sessionTotalBefore + byteSize,
					isReused: false,
					manifest: snapshot.manifest,
				},
			};
		} catch (error) {
			return { ok: false, error: { code: "io-error", message: errorMessage(error) } };
		}
	}

	private async listNumericOrdinals(): Promise<number[]> {
		const entries = await fs
			.readdir(this.rootDir, { withFileTypes: true })
			.catch((error: unknown) => {
				if (isNotFound(error)) return [];
				throw error;
			});
		return entries
			.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
			.map((entry) => Number.parseInt(entry.name, 10))
			.sort((left, right) => left - right);
	}

	private async listCommittedBundles(ordinals: readonly number[]): Promise<CommittedBundleInfo[]> {
		const bundles: CommittedBundleInfo[] = [];
		for (const ordinal of ordinals) {
			const dir = path.join(this.rootDir, String(ordinal));
			const manifest = await readManifest(path.join(dir, MANIFEST_FILE_NAME));
			if (manifest === null) continue;
			bundles.push({ ordinal, dir, byteSize: await committedBundleByteSize(dir), manifest });
		}
		return bundles;
	}
}

async function readManifest(manifestPath: string): Promise<BundleManifestSummary | null> {
	try {
		const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
		const result = bundleManifestReadSchema.safeParse(parsed);
		if (!result.success) return null;
		return result.data;
	} catch {
		return null;
	}
}

async function committedBundleByteSize(dir: string): Promise<number> {
	const files = [
		MESSAGES_FILE_NAME,
		SYSTEM_PROMPT_FILE_NAME,
		MANIFEST_FILE_NAME,
		EPISODES_FILE_NAME,
	];
	let total = 0;
	for (const file of files) {
		try {
			total += (await fs.stat(path.join(dir, file))).size;
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
	}
	return total;
}

function isNotFound(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
