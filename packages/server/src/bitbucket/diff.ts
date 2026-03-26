import { bitbucketRequest } from './client.js';
import micromatch from 'micromatch';

interface DiffstatEntry {
  status: string;
  lines_added: number;
  lines_removed: number;
  old: { path: string } | null;
  new: { path: string } | null;
}

interface DiffstatResponse {
  values: DiffstatEntry[];
  next?: string;
}

export interface PRInfo {
  id: number;
  title: string;
  author: string;
  description: string;
  sourceBranch: string;
  destBranch: string;
}

export async function getPRInfo(accessToken: string, workspace: string, repoSlug: string, prId: number): Promise<PRInfo> {
  const data = await bitbucketRequest<{
    id: number;
    title: string;
    description: string;
    author: { display_name: string };
    source: { branch: { name: string } };
    destination: { branch: { name: string } };
  }>({
    accessToken,
    path: `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`,
  });

  return {
    id: data.id,
    title: data.title,
    author: data.author.display_name,
    description: data.description ?? '',
    sourceBranch: data.source.branch.name,
    destBranch: data.destination.branch.name,
  };
}

export async function getChangedFiles(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  prId: number
): Promise<string[]> {
  const files: string[] = [];
  let url: string | undefined = `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/diffstat`;

  while (url) {
    const data: DiffstatResponse = await bitbucketRequest<DiffstatResponse>({
      accessToken,
      path: url,
    });

    for (const entry of data.values) {
      const filePath = entry.new?.path ?? entry.old?.path;
      if (filePath) {
        files.push(filePath);
      }
    }

    // Handle pagination — next URL is absolute, strip base
    if (data.next) {
      const nextUrl: URL = new URL(data.next);
      url = nextUrl.pathname.replace(/^\/2\.0/, '') + nextUrl.search;
    } else {
      url = undefined;
    }
  }

  return files;
}

export function filterFiles(files: string[], filePatterns: string[]): string[] {
  return micromatch(files, filePatterns);
}

export async function getRawDiff(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  prId: number
): Promise<string> {
  return bitbucketRequest<string>({
    accessToken,
    path: `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/diff`,
    accept: 'text/plain',
  });
}

export async function getFileContent(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  commitHash: string,
  filePath: string
): Promise<string | null> {
  try {
    return await bitbucketRequest<string>({
      accessToken,
      path: `/repositories/${workspace}/${repoSlug}/src/${commitHash}/${encodeURIComponent(filePath)}`,
      accept: 'text/plain',
    });
  } catch {
    return null;
  }
}

export async function getPRSourceCommit(accessToken: string, workspace: string, repoSlug: string, prId: number): Promise<string> {
  const data = await bitbucketRequest<{
    source: { commit: { hash: string } };
  }>({
    accessToken,
    path: `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}`,
  });
  return data.source.commit.hash;
}
