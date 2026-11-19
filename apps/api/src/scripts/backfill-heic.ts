import "../load-env.js";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DatabaseModule } from "../db/db.module.js";
import { GoogleConnectModule } from "../google-connect/google-connect.module.js";
import { IntegrationsModule } from "../integrations/index.js";
import { HeicBackfillService } from "../media/heic-backfill.service.js";
import { HeicConversionService } from "../media/heic-conversion.service.js";
import { HeicConverterService } from "../media/heic-converter.service.js";

// A lean context: no HTTP server, no pg-boss workers, no poller.
@Module({
  imports: [DatabaseModule, IntegrationsModule, GoogleConnectModule],
  providers: [HeicBackfillService, HeicConversionService, HeicConverterService],
})
class BackfillModule {}

/**
 * Converts HEIC items already in media_items to JPEG. Safe to re-run.
 * Usage: node dist/scripts/backfill-heic.js [--dry-run] [--band <bandId>]
 */
async function main() {
  const args = process.argv.slice(2);
  const bandIdx = args.indexOf("--band");
  const bandId = bandIdx >= 0 ? args[bandIdx + 1] : undefined;
  if (bandIdx >= 0 && (!bandId || bandId.startsWith("--"))) {
    console.error(
      "Usage: backfill-heic.js [--dry-run] [--band <bandId>]\n--band needs a band id",
    );
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const result = await app.get(HeicBackfillService).run({
      dryRun: args.includes("--dry-run"),
      bandId,
    });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

await main();
