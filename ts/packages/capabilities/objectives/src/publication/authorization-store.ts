import { constants, open, lstat, rename, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { randomUUID } from "node:crypto";

import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";

export interface PublicationAuthorizationStoreError {
	code: string;
	message: string;
}

export type PublicationAuthorizationStoreResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: PublicationAuthorizationStoreError };

export interface PublicationAuthorizationStore {
	bind(path: string, content: string): Promise<PublicationAuthorizationStoreResult<void>>;
	read(path: string): Promise<PublicationAuthorizationStoreResult<string>>;
	replace(path: string, content: string): Promise<PublicationAuthorizationStoreResult<void>>;
}

export interface ValidatePublicationAuthorizationPathOptions {
	path: string;
	repoRoot: string;
}

export function validatePublicationAuthorizationPath(
	options: ValidatePublicationAuthorizationPathOptions,
): PublicationAuthorizationStoreError | undefined {
	if (!isAbsolute(options.path)) {
		return error("authorization-path-not-absolute", "Authorization path must be absolute.");
	}
	const fromRepo = relative(options.repoRoot, options.path);
	if (fromRepo === "" || (!fromRepo.startsWith("..") && !isAbsolute(fromRepo))) {
		return error(
			"authorization-path-inside-repository",
			"Authorization path must be outside the repository worktree.",
		);
	}
	return undefined;
}

/** Secure one-invocation authorization storage outside the repository. */
export class RealPublicationAuthorizationStore implements PublicationAuthorizationStore {
	private readonly repoRoot: string;
	private readonly ownerUid: number | undefined;

	constructor(options: { repoRoot: string; ownerUid?: number }) {
		this.repoRoot = options.repoRoot;
		this.ownerUid = options.ownerUid ?? process.getuid?.();
	}

	async bind(path: string, content: string): Promise<PublicationAuthorizationStoreResult<void>> {
		const checked = await this.checkParent(path);
		if (!checked.ok) return checked;
		let handle;
		let created = false;
		try {
			handle = await open(
				path,
				constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
				0o600,
			);
			created = true;
			await handle.writeFile(content, "utf8");
			await handle.sync();
			return { ok: true, value: undefined };
		} catch (caught) {
			await handle?.close().catch(() => {
				// Preserve the original bind error; cleanup below remains best-effort.
			});
			handle = undefined;
			if (created) {
				await unlink(path).catch(() => {
					// A failed bind must not mask its original error with cleanup failure.
				});
			}
			return {
				ok: false,
				error: error(
					errorCodeFromUnknown(caught) === "EEXIST"
						? "authorization-already-exists"
						: "authorization-bind-failed",
					`Could not bind publication authorization: ${formatErrorMessage(caught)}`,
				),
			};
		} finally {
			await handle?.close().catch(() => {
				// The operation result already reflects the meaningful read/write outcome.
			});
		}
	}

	async read(path: string): Promise<PublicationAuthorizationStoreResult<string>> {
		const checked = await this.checkExistingFile(path);
		if (!checked.ok) return checked;
		let handle;
		try {
			handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
			return { ok: true, value: await handle.readFile("utf8") };
		} catch (caught) {
			return {
				ok: false,
				error: error(
					"authorization-read-failed",
					`Could not read publication authorization: ${formatErrorMessage(caught)}`,
				),
			};
		} finally {
			await handle?.close().catch(() => {
				// Preserve the read result; the descriptor is already unusable after a close failure.
			});
		}
	}

	async replace(path: string, content: string): Promise<PublicationAuthorizationStoreResult<void>> {
		const checked = await this.checkExistingFile(path);
		if (!checked.ok) return checked;
		const temporaryPath = join(dirname(path), `.${randomUUID()}.publication-authorization.tmp`);
		let handle;
		try {
			handle = await open(
				temporaryPath,
				constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
				0o600,
			);
			await handle.writeFile(content, "utf8");
			await handle.sync();
			await handle.close();
			handle = undefined;
			await rename(temporaryPath, path);
			return { ok: true, value: undefined };
		} catch (caught) {
			return {
				ok: false,
				error: error(
					"authorization-replace-failed",
					`Could not update publication authorization: ${formatErrorMessage(caught)}`,
				),
			};
		} finally {
			await handle?.close().catch(() => {
				// Preserve the replace result while still attempting sibling-temp cleanup.
			});
			await unlink(temporaryPath).catch(() => {
				// The temp may already have been renamed; other cleanup failures cannot replace the operation result.
			});
		}
	}

	private async checkParent(path: string): Promise<PublicationAuthorizationStoreResult<void>> {
		const pathError = validatePublicationAuthorizationPath({ path, repoRoot: this.repoRoot });
		if (pathError !== undefined) return { ok: false, error: pathError };
		try {
			const parent = await lstat(dirname(path));
			if (!parent.isDirectory() || parent.isSymbolicLink()) {
				return {
					ok: false,
					error: error(
						"authorization-parent-invalid",
						"Authorization parent must be an existing non-symlink directory.",
					),
				};
			}
			if (this.ownerUid !== undefined && parent.uid !== this.ownerUid) {
				return {
					ok: false,
					error: error(
						"authorization-parent-not-owned",
						"Authorization parent must be owned by the caller.",
					),
				};
			}
			return { ok: true, value: undefined };
		} catch (caught) {
			return {
				ok: false,
				error: error(
					"authorization-parent-invalid",
					`Could not inspect authorization parent: ${formatErrorMessage(caught)}`,
				),
			};
		}
	}

	private async checkExistingFile(
		path: string,
	): Promise<PublicationAuthorizationStoreResult<void>> {
		const parent = await this.checkParent(path);
		if (!parent.ok) return parent;
		try {
			const file = await stat(path, { bigint: false });
			const link = await lstat(path);
			if (!file.isFile() || link.isSymbolicLink()) {
				return {
					ok: false,
					error: error(
						"authorization-file-invalid",
						"Authorization path must be a regular non-symlink file.",
					),
				};
			}
			if ((file.mode & 0o777) !== 0o600) {
				return {
					ok: false,
					error: error("authorization-mode-invalid", "Authorization file mode must be 0600."),
				};
			}
			if (this.ownerUid !== undefined && file.uid !== this.ownerUid) {
				return {
					ok: false,
					error: error(
						"authorization-file-not-owned",
						"Authorization file must be owned by the caller.",
					),
				};
			}
			return { ok: true, value: undefined };
		} catch (caught) {
			return {
				ok: false,
				error: error(
					"authorization-file-invalid",
					`Could not inspect authorization file: ${formatErrorMessage(caught)}`,
				),
			};
		}
	}
}

function error(code: string, message: string): PublicationAuthorizationStoreError {
	return { code, message };
}
