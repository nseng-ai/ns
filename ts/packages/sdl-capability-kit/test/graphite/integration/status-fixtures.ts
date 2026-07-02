import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SQLITE_TEST_TIMEOUT_MS = 10_000;
const TEMP_ROOT_CLEANUP_RETRIES = 5;
const TEMP_ROOT_CLEANUP_RETRY_DELAY_MS = 100;

export interface MetadataBranchRow {
	branchName: string;
	parentBranchName?: string;
	children?: readonly string[];
	validationResult?: string;
	rawChildren?: string | null;
}

export function writeGraphiteMetadataDb(gitDir: string, rows: readonly MetadataBranchRow[]): void {
	const statements = [
		`CREATE TABLE branch_metadata (
			branch_name TEXT PRIMARY KEY,
			parent_branch_name TEXT,
			children TEXT,
			validation_result TEXT,
			extra_graphite_column TEXT
		);`,
	];
	for (const row of rows) {
		const children =
			row.rawChildren !== undefined ? row.rawChildren : JSON.stringify(row.children ?? []);
		statements.push(
			[
				"INSERT INTO branch_metadata (branch_name, parent_branch_name, children, validation_result, extra_graphite_column) VALUES (",
				sqliteTextLiteral(row.branchName),
				", ",
				sqliteNullableTextLiteral(row.parentBranchName),
				", ",
				sqliteNullableTextLiteral(children),
				", ",
				sqliteNullableTextLiteral(row.validationResult),
				", NULL);",
			].join(""),
		);
	}
	runSqliteStatements(join(gitDir, ".graphite_metadata.db"), statements);
}

export function runSqliteStatements(dbPath: string, statements: readonly string[]): void {
	const result = spawnSync("sqlite3", [dbPath], {
		encoding: "utf8",
		input: statements.join("\n"),
		timeout: SQLITE_TEST_TIMEOUT_MS,
	});
	if (result.error !== undefined || result.status !== 0) {
		throw new Error(`sqlite3 failed: ${result.error?.message ?? result.stderr}`);
	}
}

export function readGraphiteMetadataChildren(gitDir: string, branch: string): string[] {
	const result = spawnSync(
		"sqlite3",
		[
			"-json",
			join(gitDir, ".graphite_metadata.db"),
			`SELECT children FROM branch_metadata WHERE branch_name = ${sqliteTextLiteral(branch)} LIMIT 1`,
		],
		{ encoding: "utf8", timeout: SQLITE_TEST_TIMEOUT_MS },
	);
	if (result.error !== undefined || result.status !== 0) {
		throw new Error(`sqlite3 failed: ${result.error?.message ?? result.stderr}`);
	}

	const output = result.stdout.trim();
	const rows: unknown = JSON.parse(output === "" ? "[]" : output);
	if (!Array.isArray(rows)) return [];
	const row = rows[0];
	if (!isRecord(row) || typeof row.children !== "string") return [];
	const children: unknown = JSON.parse(row.children);
	if (!Array.isArray(children) || !children.every((child) => typeof child === "string")) {
		throw new Error(`Graphite children for ${branch} were not a JSON string array`);
	}
	return children;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function sqliteNullableTextLiteral(value: string | undefined | null): string {
	return value == null ? "NULL" : sqliteTextLiteral(value);
}

function sqliteTextLiteral(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
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
	writeLocalBranchRef(gitDir, branch);
	return root;
}

export function writeLocalBranchRef(gitDir: string, branch: string): void {
	const refPath = join(gitDir, "refs", "heads", branch);
	mkdirSync(dirname(refPath), { recursive: true });
	writeFileSync(refPath, "0000000000000000000000000000000000000000\n");
}

export function writeLocalBranchRefsForMetadataChildren(gitDir: string, branch: string): void {
	for (const child of readGraphiteMetadataChildren(gitDir, branch)) {
		writeLocalBranchRef(gitDir, child);
	}
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
	writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "example"\n', "utf8");
	return root;
}

export async function withTempRoot<T>(
	root: string,
	run: (root: string) => Promise<T> | T,
): Promise<T> {
	try {
		return await run(root);
	} finally {
		rmSync(root, {
			recursive: true,
			force: true,
			maxRetries: TEMP_ROOT_CLEANUP_RETRIES,
			retryDelay: TEMP_ROOT_CLEANUP_RETRY_DELAY_MS,
		});
	}
}
