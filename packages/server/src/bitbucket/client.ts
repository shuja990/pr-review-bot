const BITBUCKET_API = 'https://api.bitbucket.org/2.0';

export interface BitbucketRequestOptions {
  path: string;
  accessToken: string;
  method?: string;
  body?: unknown;
  accept?: string;
}

export async function bitbucketRequest<T = unknown>(
  opts: BitbucketRequestOptions
): Promise<T> {
  const url = `${BITBUCKET_API}${opts.path}`;

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      ...(opts.accept ? { Accept: opts.accept } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bitbucket API ${res.status}: ${opts.method ?? 'GET'} ${opts.path} — ${text}`);
  }

  if (opts.accept === 'text/plain') {
    return (await res.text()) as T;
  }

  return (await res.json()) as T;
}
