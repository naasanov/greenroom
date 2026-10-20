export const API_PORT = 4100;
export const WEB_PORT = 3100;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://greenroom:greenroom@localhost:5432/greenroom_test";
