import { Module } from "@nestjs/common";
import { TestingController } from "./testing.controller.js";

// DRIZZLE and FakeIntegrationsRegistry come from the global Database/Integrations modules.
@Module({ controllers: [TestingController] })
export class TestingModule {}
