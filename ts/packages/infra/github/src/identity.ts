export interface GithubPrIdentity {
	owner: string;
	repo: string;
	number: number;
}

export interface GithubRepositoryIdentity {
	owner: string;
	repo: string;
}

export function githubPrIdentityFromUrl(
	url: string,
	expectedNumber?: number,
): GithubPrIdentity | undefined {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	if (parsed.hostname !== "github.com") return undefined;
	const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
	if (parts.length !== 4 || parts[2] !== "pull") return undefined;
	const number = Number(parts[3]);
	if (!Number.isInteger(number) || number <= 0) return undefined;
	if (expectedNumber !== undefined && number !== expectedNumber) return undefined;
	const [owner, repo] = parts;
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0)
		return undefined;
	return { owner, repo, number };
}

export function normalizeGitRemoteUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();
	if (trimmed.length === 0) return "";

	const scpLike = parseScpLikeRemote(trimmed);
	const candidate = scpLike ?? trimmed;
	const normalizedUrl = normalizeAsUrl(candidate);
	if (normalizedUrl !== undefined) return normalizedUrl;

	return stripGitSuffix(stripTrailingSlashes(candidate));
}

export function githubRepositoryIdentityFromNormalizedRemoteUrl(
	normalizedUrl: string,
): GithubRepositoryIdentity | undefined {
	let parsed: URL;
	try {
		parsed = new URL(normalizedUrl);
	} catch {
		return undefined;
	}
	if (parsed.hostname !== "github.com") return undefined;
	const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
	if (parts.length !== 2) return undefined;
	return repositoryIdentityFromParts(parts[0], parts[1]);
}

export function githubRepositoryIdentityFromRemoteUrl(
	url: string,
): GithubRepositoryIdentity | undefined {
	const normalized = normalizeGitRemoteUrl(url);
	return githubRepositoryIdentityFromNormalizedRemoteUrl(normalized);
}

function repositoryIdentityFromParts(
	owner: string | undefined,
	repoWithSuffix: string | undefined,
): GithubRepositoryIdentity | undefined {
	if (
		owner === undefined ||
		repoWithSuffix === undefined ||
		owner.length === 0 ||
		repoWithSuffix.length === 0
	)
		return undefined;
	const repo = stripGitSuffix(repoWithSuffix);
	if (repo.length === 0 || repo.includes("/")) return undefined;
	return { owner, repo };
}

function normalizeAsUrl(value: string): string | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}

	const protocol = url.protocol.toLowerCase();
	const host = url.hostname.toLowerCase();
	const username = url.username ? `${url.username}@` : "";
	const port = url.port ? `:${url.port}` : "";
	const path = stripGitSuffix(stripTrailingSlashes(url.pathname.replace(/^\/+/, "")));
	if (path.length === 0) return `${protocol}//${username}${host}${port}`;
	return `${protocol}//${username}${host}${port}/${path}`;
}

function parseScpLikeRemote(value: string): string | undefined {
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return undefined;

	const match = /^(?<user>[^@/:]+@)?(?<host>[^:/]+):(?<path>.+)$/.exec(value);
	if (!match?.groups) return undefined;

	const user = match.groups.user ?? "";
	return `ssh://${user}${match.groups.host}/${match.groups.path}`;
}

function stripTrailingSlashes(value: string): string {
	return value.replace(/\/+$/g, "");
}

function stripGitSuffix(value: string): string {
	return value.replace(/\.git$/i, "");
}
