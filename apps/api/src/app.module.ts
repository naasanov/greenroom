import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/db.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
