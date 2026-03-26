import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createHash } from 'crypto';
import { env } from '../config.js';
import { getChangedFiles, filterFiles, getRawDiff, getPRInfo, getPRSourceCommit, getFileContent, type PRInfo } from '../bitbucket/diff.js';
import { postPRComment } from '../bitbucket/comments.js';
import { getLatestReviewForPR, setReviewSummaryCommentId } from '../db/repository.js';
import { parsePRDiff, type ParsedFile } from './parser.js';
import { buildFilePrompt } from './prompt.js';

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  maxRetries: 2,
  timeout: 60_000,
});

// Claude Sonnet 4 pricing (per million tokens)
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;

// Concurrency for parallel file reviews
const CONCURRENCY = 2;
const BATCH_DELAY_MS = 5000;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const reviewCommentSchema = z.array(
  z.object({
    line: z.number(),
    severity: z.enum(['critical', 'warning', 'info']),
    body: z.string(),
  })
);

export type ReviewComment = z.infer<typeof reviewCommentSchema>[number] & {
  filePath: string;
};

export interface ReviewResult {
  prInfo: PRInfo;
  comments: ReviewComment[];
  filesReviewed: number;
  filesSkipped: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fileHashes: Record<string, string>;
}

interface FileReviewResult {
  comments: ReviewComment[];
  inputTokens: number;
  outputTokens: number;
}

async function reviewFile(
  file: ParsedFile,
  options?: {
    customInstructions?: string;
    prTitle?: string;
    prDescription?: string;
    fullFileContent?: string | null;
  }
): Promise<FileReviewResult> {
  const { system, user } = buildFilePrompt(file, options);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  try {
    // Extract JSON array from response — handle markdown fences and prose preamble
    let cleaned = text.trim();
    // Strip markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?\s*```\s*$/m, '').trim();
    // If the model wrote prose before the JSON, extract the array
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      // No JSON array found — treat as empty (model gave prose-only response)
      return { comments: [], inputTokens, outputTokens };
    }
    const parsed = JSON.parse(arrayMatch[0]);
    const comments = reviewCommentSchema.parse(parsed);

    return {
      comments: comments.map((c) => ({
        ...c,
        filePath: file.filePath,
      })),
      inputTokens,
      outputTokens,
    };
  } catch {
    console.error(
      `Failed to parse AI response for ${file.filePath}:`,
      text.slice(0, 200)
    );
    return { comments: [], inputTokens, outputTokens };
  }
}

const MAX_FILE_LINES = 2000;

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function deduplicateComments(comments: ReviewComment[]): ReviewComment[] {
  const normalize = (body: string) =>
    body.toLowerCase().replace(/\blines?\s+\d+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

  const groups = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const key = normalize(c.body);
    const group = groups.get(key);
    if (group) {
      group.push(c);
    } else {
      groups.set(key, [c]);
    }
  }

  const result: ReviewComment[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (group.length > 1) {
      const otherLocations = group
        .slice(1)
        .map((c) => `${c.filePath}:${c.line}`)
        .join(', ');
      result.push({
        ...first,
        body: `${first.body}\n\n_Same issue also at: ${otherLocations}_`,
      });
    } else {
      result.push(first);
    }
  }

  return result;
}

function buildSummaryComment(result: ReviewResult): string {
  const critical = result.comments.filter((c) => c.severity === 'critical').length;
  const warnings = result.comments.filter((c) => c.severity === 'warning').length;
  const info = result.comments.filter((c) => c.severity === 'info').length;

  const lines: string[] = [
    `## 🔍 AI Code Review Summary`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files reviewed | ${result.filesReviewed} |`,
    `| Files skipped | ${result.filesSkipped} |`,
    `| Total comments | ${result.comments.length} |`,
  ];

  if (critical > 0) lines.push(`| 🔴 Critical | ${critical} |`);
  if (warnings > 0) lines.push(`| 🟡 Warnings | ${warnings} |`);
  if (info > 0) lines.push(`| 🔵 Info | ${info} |`);

  lines.push(`| Tokens used | ${(result.inputTokens + result.outputTokens).toLocaleString()} |`);
  lines.push(`| Cost | $${result.costUsd.toFixed(4)} |`);

  if (result.comments.length === 0) {
    lines.push('', '✅ No issues found. Code looks good!');
  } else if (critical > 0) {
    lines.push('', `⚠️ **${critical} critical issue${critical > 1 ? 's' : ''} found** — please review before merging.`);
  }

  lines.push('', '_Review generated by PR Review Bot_');

  return lines.join('\n');
}

export async function reviewPR(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  prId: number,
  customInstructions?: string,
  filePatterns: string[] = ['**/*']
): Promise<ReviewResult> {
  console.log(`[reviewPR] Starting review for ${workspace}/${repoSlug} PR #${prId}`);

  const [prInfo, changedFiles, rawDiff] = await Promise.all([
    getPRInfo(accessToken, workspace, repoSlug, prId),
    getChangedFiles(accessToken, workspace, repoSlug, prId),
    getRawDiff(accessToken, workspace, repoSlug, prId),
  ]);
  console.log(`[reviewPR] Fetched PR info: "${prInfo.title}", ${changedFiles.length} changed files`);

  const filtered = filterFiles(changedFiles, filePatterns);
  const parsed = parsePRDiff(rawDiff, filtered);

  // Skip very large files
  const reviewable = parsed.filter(
    (f) => f.additions + f.deletions <= MAX_FILE_LINES
  );

  // ─── Re-review awareness: skip files unchanged since last review ─────────
  const previousReview = getLatestReviewForPR(repoSlug, prId);
  const previousHashes: Record<string, string> = previousReview
    ? JSON.parse(previousReview.file_hashes || '{}')
    : {};

  const currentHashes: Record<string, string> = {};
  const filesToReview: ParsedFile[] = [];

  for (const file of reviewable) {
    const content = file.hunks.map((h) => h.content).join('\n');
    const hash = hashContent(content);
    currentHashes[file.filePath] = hash;

    if (previousHashes[file.filePath] === hash) {
      // File diff identical to last review — skip
      continue;
    }
    filesToReview.push(file);
  }

  const skippedByReReview = reviewable.length - filesToReview.length;

  // ─── Fetch full file content for context ──────────────────────────────────
  let sourceCommit: string | undefined;
  try {
    sourceCommit = await getPRSourceCommit(accessToken, workspace, repoSlug, prId);
  } catch {
    // Non-critical — review will proceed without full file context
  }

  const fileContents = new Map<string, string | null>();
  if (sourceCommit) {
    const contentResults = await Promise.all(
      filesToReview.map(async (file) => {
        const content = await getFileContent(accessToken, workspace, repoSlug, sourceCommit, file.filePath);
        return { path: file.filePath, content };
      })
    );
    for (const { path, content } of contentResults) {
      fileContents.set(path, content);
    }
  }

  // ─── Review files ─────────────────────────────────────────────────────────

  const reviewOptions = {
    customInstructions,
    prTitle: prInfo.title,
    prDescription: prInfo.description,
  };

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Review files in parallel batches (2 at a time with delay between batches)
  const fileResults: FileReviewResult[] = [];
  for (let i = 0; i < filesToReview.length; i += CONCURRENCY) {
    if (i > 0) await delay(BATCH_DELAY_MS);
    const batch = filesToReview.slice(i, i + CONCURRENCY);
    console.log(`[reviewPR] Reviewing batch ${Math.floor(i / CONCURRENCY) + 1}: ${batch.map(f => f.filePath).join(', ')}`);
    const batchResults = await Promise.all(
      batch.map((file) =>
        reviewFile(file, {
          ...reviewOptions,
          fullFileContent: fileContents.get(file.filePath) ?? null,
        })
      )
    );
    console.log(`[reviewPR] Batch complete — ${batchResults.reduce((s, r) => s + r.comments.length, 0)} comments`);
    fileResults.push(...batchResults);
  }

  const allComments: ReviewComment[] = [];
  for (const result of fileResults) {
    allComments.push(...result.comments);
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
  }

  const dedupedComments = deduplicateComments(allComments);

  const costUsd =
    (totalInputTokens / 1_000_000) * INPUT_COST_PER_M +
    (totalOutputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  const reviewResult: ReviewResult = {
    prInfo,
    comments: dedupedComments,
    filesReviewed: filesToReview.length,
    filesSkipped: parsed.length - reviewable.length + skippedByReReview,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUsd,
    fileHashes: currentHashes,
  };

  console.log(`[reviewPR] Review complete — ${dedupedComments.length} comments, $${costUsd.toFixed(4)}`);
  return reviewResult;
}

export async function postSummaryComment(
  accessToken: string,
  workspace: string,
  repoSlug: string,
  prId: number,
  reviewId: string,
  result: ReviewResult
): Promise<void> {
  try {
    const summary = buildSummaryComment(result);
    const { id: commentId } = await postPRComment(accessToken, workspace, repoSlug, prId, summary);
    setReviewSummaryCommentId(reviewId, commentId);
  } catch (err) {
    console.error('Failed to post summary comment:', err);
  }
}
