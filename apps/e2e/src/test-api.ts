import type { APIRequestContext } from "@playwright/test";
import type { Scenario, SeedResult } from "@greenroom/db";

type SeedFor<S extends Scenario> = Extract<SeedResult, { scenario: S }>;

export interface MagicLink {
  to: string;
  link: string;
}

/** Typed client for the API's /__test__ control endpoints. */
export class TestApi {
  constructor(private readonly request: APIRequestContext) {}

  private async call<T>(
    method: "get" | "post",
    path: string,
    options?: Parameters<APIRequestContext["post"]>[1],
  ): Promise<T> {
    const res = await this.request[method](`/__test__/${path}`, options);
    if (!res.ok()) {
      throw new Error(
        `/__test__/${path} -> ${res.status()}: ${await res.text()}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Truncates every app table and resets all fakes. */
  async reset(): Promise<void> {
    await this.call("post", "reset");
  }

  /** Resets, then loads a scenario. Returns the fixture ids and handles. */
  seed<S extends Scenario>(scenario: S): Promise<SeedFor<S>> {
    return this.call("post", "seed", { data: { scenario } });
  }

  /** Magic links the email fake has "sent" to this address, oldest first. */
  async magicLinksFor(email: string): Promise<MagicLink[]> {
    const { links } = await this.call<{ links: MagicLink[] }>(
      "get",
      "email/magic-links",
      { params: { to: email } },
    );
    return links;
  }
}
