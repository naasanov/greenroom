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
