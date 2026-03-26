import parseDiff from 'parse-diff';

export interface FileHunk {
  oldStart: number;
  newStart: number;
  oldLines: number;
  newLines: number;
  content: string;
}

export interface ParsedFile {
  filePath: string;
  hunks: FileHunk[];
  additions: number;
  deletions: number;
}

export function parsePRDiff(rawDiff: string, allowedFiles?: string[]): ParsedFile[] {
  const files = parseDiff(rawDiff);
  const result: ParsedFile[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? 'unknown';
    if (filePath === '/dev/null') continue;

    if (allowedFiles && !allowedFiles.includes(filePath)) {
      continue;
    }

    const hunks: FileHunk[] = file.chunks.map((chunk) => {
      // parse-diff already includes +/- prefix in change.content
      const lines = chunk.changes
        .map((change) => change.content)
        .join('\n');

      return {
        oldStart: chunk.oldStart,
        newStart: chunk.newStart,
        oldLines: chunk.oldLines,
        newLines: chunk.newLines,
        content: lines,
      };
    });

    result.push({
      filePath,
      hunks,
      additions: file.additions,
      deletions: file.deletions,
    });
  }

  return result;
}
