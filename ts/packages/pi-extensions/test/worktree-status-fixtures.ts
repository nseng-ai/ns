import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";

export interface MetadataBranchRow {
	branchName: string;
	parentBranchName?: string;
	children?: readonly string[];
	validationResult?: string;
	rawChildren?: string | null;
}

export function writeGraphiteMetadataDb(gitDir: string, rows: readonly MetadataBranchRow[]): void {
	const db = new Database(join(gitDir, ".graphite_metadata.db"));
	try {
		db.run(`
			CREATE TABLE branch_metadata (
				branch_name TEXT PRIMARY KEY,
				parent_branch_name TEXT,
				children TEXT,
				validation_result TEXT,
				extra_graphite_column TEXT
			)
		`);
		const insert = db.prepare<unknown, [string, string | null, string | null, string | null, null]>(
			"INSERT INTO branch_metadata (branch_name, parent_branch_name, children, validation_result, extra_graphite_column) VALUES (?, ?, ?, ?, ?)",
		);
		for (const row of rows) {
			const children = row.rawChildren !== undefined ? row.rawChildren : JSON.stringify(row.children ?? []);
			insert.run(row.branchName, row.parentBranchName ?? null, children, row.validationResult ?? null, null);
		}
	} finally {
		db.close();
	}
}

export function standardGraphiteRows(): MetadataBranchRow[] {
	return [
		{ branchName: "main", children: ["feature/current"], validationResult: "TRUNK" },
		{ branchName: "feature/current", parentBranchName: "main" },
	];
}

export function makeGitRepo(branch: string): string {
	const root = mkdtempSync(join(tmpdir(), "worktree-status-"));
	const gitDir = join(root, ".git");
	mkdirSync(gitDir);
	writeFileSync(join(gitDir, "HEAD"), `ref: refs/heads/${branch}\n`);
	return root;
}

export function makeGraphiteRepo(
	branch = "feature/current",
	rows: readonly MetadataBranchRow[] = standardGraphiteRows(),
): string {
	const root = makeGitRepo(branch);
	writeGraphiteMetadataDb(join(root, ".git"), rows);
	return root;
}

export function makePyprojectRoot(): string {
	const root = makeGraphiteRepo();
	writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"example\"\n", "utf8");
	return root;
}

export async function withTempRoot<T>(root: string, run: (root: string) => Promise<T> | T): Promise<T> {
	try {
		return await run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}
