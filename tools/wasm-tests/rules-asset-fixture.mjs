import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Synthetic source-data fixture with both cost scalars and distinct earlier
// rows. No installed text is copied; the asset store verifies size and hash.
export function syntheticNutrientRules(value, mineralValue = 10) {
  return `#RULES\n31,\n41,\n51,61\n71,\n81,\n${value},\n${mineralValue},\n#END\n`;
}

export async function overrideRulesAsset(page, source) {
  const bytes = Buffer.from(source, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let reads = 0;
  await page.route('**/assets/manifest.json', async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'The actual asset manifest is available');
    const manifest = await response.json();
    const entries = manifest.files.filter((entry) => entry.path.toLowerCase() === 'alphax.txt');
    assert.equal(entries.length, 1, 'Exactly one installed SMACX rules source exists');
    entries[0].size = bytes.length;
    entries[0].sha256 = sha256;
    await route.fulfill({ json: manifest });
  });
  await page.route(/\/assets\/alphax\.txt$/i, async (route) => {
    reads += 1;
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: bytes });
  });
  return { reads: () => reads, sha256 };
}
