import { NotImplementedError, notImplemented } from "../not-implemented.js";
import type {
  BuildAuthUrlInput,
  ExchangeCodeResult,
  GoogleOAuthAdapter,
  RefreshResult,
} from "./google-oauth.adapter.js";

export class RealGoogleOAuthAdapter implements GoogleOAuthAdapter {
  buildAuthUrl(input: BuildAuthUrlInput): string {
    void input;
    throw new NotImplementedError("GoogleOAuth", "1.2");
  }
  exchangeCode(): Promise<ExchangeCodeResult> {
    return notImplemented("GoogleOAuth", "1.2");
  }
  refreshAccessToken(): Promise<RefreshResult> {
    return notImplemented("GoogleOAuth", "1.2");
  }
}
