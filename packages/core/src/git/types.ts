export type ChangedFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied";

export interface ChangedFile {
  path: string;
  oldPath?: string;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
  extension: string;
  directory: string;
  isTest: boolean;
  isGenerated: boolean;
  isBinary: boolean;
}

export interface FileStat {
  path: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

export interface ChangeStats {
  filesChanged: number;
  additions: number;
  deletions: number;
  directoriesChanged: number;
}

export interface ChangeSet {
  baseRef: string;
  headRef: string;
  mergeBase: string;
  files: ChangedFile[];
  stats: ChangeStats;
  patch: string;
}
