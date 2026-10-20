import { notImplemented } from "../not-implemented.js";
import type { EmailAdapter } from "./email.adapter.js";

export class RealEmailAdapter implements EmailAdapter {
  sendMagicLink(): Promise<void> {
    return notImplemented("Email", "1.2");
  }
}
