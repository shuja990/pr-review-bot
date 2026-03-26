import { bitbucketRequest } from './client.js';

export interface InlineComment {
  filePath: string;
  line: number;
  body: string;
}

export async function postInlineComment(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  prId: number,
  comment: InlineComment
): Promise<{ id: number }> {
  const data = await bitbucketRequest<{ id: number }>({
    accessToken,
    path: `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/comments`,
    method: 'POST',
    body: {
      content: {
        raw: comment.body,
      },
      inline: {
        path: comment.filePath,
        to: comment.line,
      },
    },
  });

  return { id: data.id };
}

export async function postPRComment(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  prId: number,
  body: string
): Promise<{ id: number }> {
  const data = await bitbucketRequest<{ id: number }>({
    accessToken,
    path: `/repositories/${workspace}/${repoSlug}/pullrequests/${prId}/comments`,
    method: 'POST',
    body: {
      content: {
        raw: body,
      },
    },
  });

  return { id: data.id };
}

const POST_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postBatchComments(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  prId: number,
  comments: InlineComment[]
): Promise<{ id: number; filePath: string; line: number }[]> {
  const results = [];

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    const result = await postInlineComment(accessToken, workspace, repoSlug, prId, comment);
    results.push({
      id: result.id,
      filePath: comment.filePath,
      line: comment.line,
    });

    // Rate-limit: delay between posts to avoid Bitbucket throttling
    if (i < comments.length - 1) {
      await delay(POST_DELAY_MS);
    }
  }

  return results;
}
