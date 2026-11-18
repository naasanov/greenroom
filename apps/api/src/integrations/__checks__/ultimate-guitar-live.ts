// Hits the real site. Run after build: node dist/integrations/__checks__/ultimate-guitar-live.js
import assert from "node:assert/strict";
import { RealUltimateGuitarAdapter } from "../ultimate-guitar/ultimate-guitar.real.js";

async function main(): Promise<void> {
  const ug = new RealUltimateGuitarAdapter();
  const results = await ug.search("wonderwall oasis");
  console.log(`search results: ${results.length}`);
  const top = results.find(
    (r) => r.type === "Chords" && r.accessType === "public" && !r.marketingType,
  );
  assert.ok(top, "no community chords result");
  console.log(`top chords result: ${top.url} (${top.rating}, ${top.votes})`);
  const tab = await ug.fetchTab(top.url);
  assert.equal(tab.isOfficial, false);
  assert.ok(tab.content.trim().length > 0, "tab content is empty");
  console.log(
    `tab: ${tab.songName} / ${tab.artistName} key=${tab.key} capo=${tab.capo} chars=${tab.content.length}`,
  );
  console.log("ultimate guitar live check: ok");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
