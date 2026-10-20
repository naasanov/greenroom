export const EMAIL = Symbol("EMAIL");

export interface EmailAdapter {
  sendMagicLink(input: { to: string; link: string }): Promise<void>;
}
