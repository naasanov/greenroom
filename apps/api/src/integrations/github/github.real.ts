import { notImplemented } from "../not-implemented.js";
import type { CreatedIssue, GithubAdapter } from "./github.adapter.js";

export class RealGithubAdapter implements GithubAdapter {
  createIssue(): Promise<CreatedIssue> {
    return notImplemented("GitHub", "7.3");
  }
}
