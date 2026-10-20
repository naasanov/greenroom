import { Controller, Get } from "@nestjs/common";
import { healthResponseSchema, type HealthResponse } from "@greenroom/shared";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({ status: "ok", version: "0.0.1" });
  }
}
