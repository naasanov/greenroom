import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import {
  feedbackSchema,
  type FeedbackInput,
  type FeedbackResult,
  type User,
} from "@greenroom/shared";
import { CurrentUser } from "../auth/decorators.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { FeedbackService } from "./feedback.service.js";

@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(201)
  submit(
    @CurrentUser() user: User,
    @Body(new ZodPipe(feedbackSchema)) body: FeedbackInput,
  ): Promise<FeedbackResult> {
    return this.feedback.submit(user, body);
  }
}
