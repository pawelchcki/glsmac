import assert from 'node:assert/strict';
import {test} from 'node:test';
import {replaceStartingTechnology} from './rules-asset-fixture.mjs';

test('a starting-technology browser override preserves every unrelated source byte', () => {
  const source = Buffer.from('#GAIANS\r\nHeader Ecology\r\n TECH, Ecology, TECH, Other, SOCIAL, -MORALE, ; Ecology\r\nNext Ecology\r\n#END\r\n', 'latin1');
  const changed = replaceStartingTechnology(source, 'GAIANS', 'Ecology', 'Physic');
  assert.equal(changed.toString('latin1'), source.toString('latin1').replace('TECH, Ecology,', 'TECH, Physic,'));
  assert.throws(() => replaceStartingTechnology(source, 'GAIANS', 'Missing', 'Physic'));
  assert.throws(() => replaceStartingTechnology(source, 'OTHER', 'Ecology', 'Physic'));
});

test('ambiguous starting-technology input edits are rejected', () => {
  const source = Buffer.from('#GAIANS\nHeader\nTECH,Ecology,TECH,Ecology\n#END\n');
  assert.throws(() => replaceStartingTechnology(source, 'GAIANS', 'Ecology', 'Physic'));
});
