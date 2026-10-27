// Candidate-only declared inputs. Native source parsing and real controls
// supply outcomes; no original observations are read by this module.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

export const primitives = ['farm','soil_enricher','mine','solar','forest','road','mag_tube','bunker','airbase','sensor',
  'remove_fungus','plant_fungus','condenser','mirror','borehole','aquifer','raise','lower','level'];
export const seaActions = ['farm','mine','solar','remove_fungus','plant_fungus','raise','lower'];
export const commands = ['farm_solar_road','farm_mine_road','road_to','tube_to','auto_roads','auto_tubes','auto_sensors',
  'auto_remove_fungus','auto_home_base','auto_former'];
export const cases = [
  ...primitives.map(action=>({id:`land:${action}`,action,water:false,command:false})),
  ...seaActions.map(action=>({id:`sea:${action}`,action,water:true,command:false})),
  ...commands.map(action=>({id:`command:${action}`,action,water:false,command:true})),
];

export function declaredTerrain(spec={}) {
  const width=16,height=16,count=width*height/2,offset=15+0xaa4;
  const aw=Math.ceil(width/5),ah=Math.ceil(height/5),ac=Math.floor((aw+1)/2)*ah;
  const bytes=Buffer.alloc(offset+count*44+ac);
  bytes.write('TERRANMAP\0\x1a',0,'binary');bytes.writeUInt32LE(5,11);
  for(const[at,value]of[[0,width],[4,height],[20,count],[0xa24,aw],[0xa28,ah],[0xa2c,ac]])bytes.writeUInt32LE(value,15+at);
  for(let i=0;i<count;i++){bytes[offset+i*44]=96;bytes[offset+i*44+1]=64;}
  // Native candidate SMACMap input format, not original effect expectations.
  const actor=offset+(8*width/2+8/2)*44;
  if(spec.water){bytes[actor]=64;bytes[actor+1]=50;}
  else if(spec.action==='lower'){bytes[actor]=128;bytes[actor+1]=90;}
  if(spec.action==='level')bytes[actor+5]=128;
  let improvements=0;
  if(spec.action==='soil_enricher')improvements|=0x8000;
  if(spec.action==='mag_tube')improvements|=0x4;
  if(spec.action==='remove_fungus'||spec.action==='auto_remove_fungus')improvements|=0x20;
  bytes.writeUInt32LE(improvements,actor+8);
  if(spec.action==='aquifer'){
    const outlet=offset+(8*width/2+6/2)*44;bytes[outlet]=64;bytes[outlet+1]=50;
  }
  return bytes;
}

export function rateOneSource(bytes) {
  const text=bytes.toString('latin1'),lines=text.split('\n');let active=false,count=0;
  for(let i=0;i<lines.length;i++){
    const trimmed=lines[i].trim();
    if(trimmed==='#TERRAIN'){assert.equal(active,false);active=true;continue;}
    if(active&&trimmed.startsWith('#'))break;
    if(active&&trimmed&&!trimmed.startsWith(';')){
      const semicolon=lines[i].indexOf(';');const body=semicolon<0?lines[i]:lines[i].slice(0,semicolon);
      const suffix=semicolon<0?'':lines[i].slice(semicolon);const fields=body.trimEnd().split(',');
      assert.ok(fields.length>=8);fields[4]='1';lines[i]=fields.join(',')+suffix;count++;
    }
  }
  assert.equal(count,20,'Exactly the installed twenty action source rows must enter the real parser');
  return Buffer.from(lines.join('\n'),'latin1');
}

export function fixtureSources(root,spec={water:false}) {
  const world=readFileSync(`${root}/tools/wasm-tests/fixtures/terraform-controls-world.gls.js`,'utf8')
    .replace('__WATER_ACTOR__',spec.water?'true':'false');
  const main=readFileSync(`${root}/tools/wasm-tests/fixtures/terraform-controls-main.gls.js`,'utf8');
  assert.ok(!world.includes('__WATER_ACTOR__'));
  return {world,main};
}
