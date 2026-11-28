import {
  GithubNotConfiguredError,
  type CreateIssueInput,
  type CreatedIssue,
  type GithubAdapter,
} from "./github.adapter.js";
import { httpFailure, httpRequest } from "../http.js";

const DEFAULT_REPO = "naasanov/greenroom";
const TIMEOUT_MS = 10_000;

/** Opens issues through the GitHub REST API with a fine-grained token. */
export class RealGithubAdapter implements GithubAdapter {
  async createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
    const token = process.env.GITHUB_FEEDBACK_TOKEN;
    if (!token) throw new GithubNotConfiguredError();
    const repo = process.env.GITHUB_FEEDBACK_REPO || DEFAULT_REPO;
    const res = await httpRequest(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "greenroom-feedback",
        },
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          labels: input.labels ?? [],
        }),
      },
      { timeoutMs: TIMEOUT_MS },
    );
    if (!res.ok) {
      throw await httpFailure(
        res,
        300,
        (detail) =>
          `GitHub issue creation failed with ${res.status} repo=${repo}: ${detail}`,
      );
    }
    const data = (await res.json()) as { number: number; html_url: string };
    return { number: data.number, url: data.html_url };
  }
}
