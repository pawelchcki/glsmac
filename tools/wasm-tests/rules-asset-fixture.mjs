import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Existing cost fixtures declare their historical reproduction dimensions.
// Separate alternate rows below prove the table reaches actual generated maps.
const legacyWorldRows = [
  ['Tiny Planet', 34, 34], ['Small Planet', 44, 44], ['Standard Planet', 56, 56],
  ['Large Planet', 70, 70], ['Huge Planet', 90, 90],
];
export const alternateWorldRows = [
  ['Amber|Swift', 26, 44], ['Birch', 34, 58], ['Cedar', 44, 74],
  ['Dune', 54, 92], ['Elm|Patient', 66, 114],
];

// Synthetic source only; the normal asset store verifies its size and hash.
export function syntheticNutrientRules(value, mineralValue = 10, worldRows = legacyWorldRows) {
  return `#RULES\n31,\n41,\n51,61\n71,\n81,\n${value},\n${mineralValue},\n#END\n`
    + `#WORLDSIZE\n${worldRows.length}\n${worldRows.map((row) => row.join(',')).join('\n')}\n#END\n`
    // The ordinary setup fixture also enters the real faction source consumer.
    // These are declared catalog inputs; identity headers remain real assets.
    + '#FACTIONS\nGAIANS,GAIANS\nHIVE,HIVE\nUNIV,UNIV\nMORGAN,MORGAN\nSPARTANS,SPARTANS\nBELIEVE,BELIEVE\nPEACE,PEACE\n'
    + '#NEWFACTIONS\nCYBORG,CYBORG\nPIRATES,PIRATES\nDRONE,DRONE\nANGELS,ANGELS\nFUNGBOY,FUNGBOY\nCARETAKE,CARETAKE\nUSURPER,USURPER\n#CUSTOMFACTIONS\n#END\n';
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
