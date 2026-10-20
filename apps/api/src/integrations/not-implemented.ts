export class NotImplementedError extends Error {
  constructor(service: string, task: string) {
    super(`${service} real adapter is not implemented yet, see task ${task}`);
    this.name = "NotImplementedError";
  }
}

/** Returns a rejected promise so real-adapter stubs fail like async calls do. */
export function notImplemented(service: string, task: string): Promise<never> {
  return Promise.reject(new NotImplementedError(service, task));
}
