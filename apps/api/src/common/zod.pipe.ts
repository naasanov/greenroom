import { BadRequestException, type PipeTransform } from "@nestjs/common";

/** Structural subset of a Zod schema, so the API needs no direct zod dependency. */
interface ParseableSchema<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: unknown[] } };
}

/** Validates a body/query value against a Zod schema and returns the parsed result. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ParseableSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
