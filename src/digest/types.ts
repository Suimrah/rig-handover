// Plan morning-digest § 1. Every part of § 2 is written against this file.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night, folded from its lines in runs/<night>.jsonl. Times keep the log's offset.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// null when runs/<night>.jsonl doesn't exist (404). An empty file is rows: [].
export type Night = {
  night: string;
  rows: DigestRow[]; // sorted by job
  badLines: number;
};

export type ReadNight = (runsDir: string, night: string) => Night | null;
