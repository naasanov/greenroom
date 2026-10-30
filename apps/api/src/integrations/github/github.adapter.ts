export const GITHUB = Symbol("GITHUB");

export interface CreateIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export interface CreatedIssue {
  number: number;
  url: string;
}

export interface GithubAdapter {
  createIssue(input: CreateIssueInput): Promise<CreatedIssue>;
}

/** Thrown by the real adapter when no GitHub token is set. */
export class GithubNotConfiguredError extends Error {
  constructor() {
    super("GITHUB_FEEDBACK_TOKEN is not set");
    this.name = "GithubNotConfiguredError";
  }
}
