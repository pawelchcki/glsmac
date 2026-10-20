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

// Minimal equivalent basic unit inputs. Asset-backed default-rule browser
// paths still consume the full installed component and morale tables.
const basicUnitRules = `#UNITS
3
Colony Pod,Infantry,Module,Scout,8,0,0,None,-1,00000000000000000000000000
Formers,Infantry,Terraformer,Scout,9,0,0,Ecology,-1,00000000000000000000000000
Scout Patrol,Infantry,Gun,Scout,3,0,0,None,-1,00000000000000000000000000
#CHASSIS
Infantry,M1,Squad,M1,Sentinels,M2,Garrison,M1,1,0,0,0,1,1,None
#WEAPONS
Hand Weapons,Gun,1,0,1,-1,None
Colony Module,Module,0,8,10,-1,None
Terraforming Unit,Terraformer,0,9,6,-1,Ecology
#DEFENSES
No Armor,Scout,1,0,1,None
#REACTORS
Fission Plant,Fission,1,None
#MORALE
Very Green,Hatchling
Green,Larval Mass
Disciplined,Pre-Boil
Hardened,Boil
Veteran,Mature Boil
Commando,Great Boil
Elite,Demon Boil
#END
`;

// Synthetic source only; the normal asset store verifies its size and hash.
export function syntheticNutrientRules(value, mineralValue = 10, worldRows = legacyWorldRows) {
  const ruleRows = ['31', '41', '51,61', '71', '81', String(value), String(mineralValue), '0', '1', '-1'];
  while (ruleRows.length < 53) ruleRows.push('0');
  ruleRows.push('Gene', 'EcoEng', 'EnvEcon');
  return `#RULES\n${ruleRows.join('\n')}\n#END\n`
    + '#RESOURCEINFO\nOcean Square,1,0,0,0\nBase Square,2,1,1,0\nBonus Square,2,2,2,0\nForest Square,1,2,1,0\nRecycling Tanks,1,1,1,0\nImproved Land,1,*,*,0\n#END\n'
    + `#WORLDSIZE\n${worldRows.length}\n${worldRows.map((row) => row.join(',')).join('\n')}\n#END\n`
    // The ordinary setup fixture also enters the real faction source consumer.
    // These are declared catalog inputs; identity headers remain real assets.
    + '#FACTIONS\nGAIANS,GAIANS\nHIVE,HIVE\nUNIV,UNIV\nMORGAN,MORGAN\nSPARTANS,SPARTANS\nBELIEVE,BELIEVE\nPEACE,PEACE\n'
    + '#NEWFACTIONS\nCYBORG,CYBORG\nPIRATES,PIRATES\nDRONE,DRONE\nANGELS,ANGELS\nFUNGBOY,FUNGBOY\nCARETAKE,CARETAKE\nUSURPER,USURPER\n#CUSTOMFACTIONS\n#END\n'
    + basicUnitRules;
}

export async function overrideRulesAsset(page, source, extraSources = {}) {
  const bytes = Buffer.from(source, 'utf8');
  const sources = new Map([['alphax.txt', bytes], ...Object.entries(extraSources)]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let reads = 0;
  await page.route('**/assets/manifest.json', async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'The actual asset manifest is available');
    const manifest = await response.json();
    for (const [name, data] of sources) {
      const entries = manifest.files.filter((entry) => entry.path.toLowerCase() === name);
      assert.equal(entries.length, 1, `Exactly one installed source exists for ${name}`);
      entries[0].size = data.length;
      entries[0].sha256 = createHash('sha256').update(data).digest('hex');
    }
    await route.fulfill({ json: manifest });
  });
  const sourceReads = new Map();
  await page.route(/\/assets\/(?:alphax|gaians|cyborg)\.txt$/i, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1).toLowerCase();
    if (!sources.has(name)) return route.fallback();
    if (name === 'alphax.txt') reads += 1;
    sourceReads.set(name, (sourceReads.get(name) ?? 0) + 1);
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: sources.get(name) });
  });
  return { reads: () => reads, sha256, sourceReads };
}

export function replaceStartingTechnology(raw, block, previous, replacement) {
  const text = raw.toString('latin1');
  const lines = text.split(/(?<=\n)/);
  const starts = lines.flatMap((line, i) => line.trim() === `#${block}` ? [i] : []);
  assert.equal(starts.length, 1, 'One exact faction block is present');
  const index = starts[0] + 2;
  const body = lines[index].split(';', 1)[0];
  const fields = body.trimEnd().split(',');
  let changes = 0;
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i].trim().toUpperCase() === 'TECH' && fields[i + 1].trim() === previous) {
      fields[i + 1] = fields[i + 1].replace(previous, replacement); changes++;
    }
  }
  assert.equal(changes, 1, 'Only one declared technology input is exchanged');
  const suffix = lines[index].slice(body.trimEnd().length);
  lines[index] = fields.join(',') + suffix;
  return Buffer.from(lines.join(''), 'latin1');
}
