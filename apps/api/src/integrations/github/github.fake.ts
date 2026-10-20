import type {
  CreateIssueInput,
  CreatedIssue,
  GithubAdapter,
} from "./github.adapter.js";

export type FakeIssue = CreateIssueInput & CreatedIssue;

export class FakeGithubAdapter implements GithubAdapter {
  private issues: FakeIssue[] = [];

  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    const number = this.issues.length + 1;
    const created = {
      number,
      url: `https://github.test/naasanov/greenroom/issues/${number}`,
    };
    this.issues.push({
      ...input,
      labels: [...(input.labels ?? [])],
      ...created,
    });
    return created;
  }

  // ---- test controls ----

  createdIssues(): FakeIssue[] {
    return this.issues.map((i) => ({ ...i }));
  }

  reset(): void {
    this.issues = [];
  }
}
