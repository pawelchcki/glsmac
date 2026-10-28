// New declared map bytes only. The importer and actual quote supply outcomes.
import {declaredTerrain} from './terraform-browser-inputs.mjs';
export const seaHeightInput=Object.freeze({version:2,bootstrap_contract:'installed-source-current-turn-production.v2',width:16,height:16,players:7,
  port:Object.freeze({x:10,y:8}),actor:Object.freeze({x:8,y:8}),
  changed_map_fields:Object.freeze({altitude_byte:32,contour_byte:30}),
  action:'raise',domain:'sea remains sea',production_stock:'actual source Sea recipe cost plus3; restored during queued startup before ordinary production'});
export function seaHeightTerrain(){
  const bytes=declaredTerrain(),offset=15+0xaa4+(8*16/2+8/2)*44;
  // One deep-water tile beside the authored land port; all other imported
  // bytes are unchanged. Actual native height/geometry are always observed.
  bytes[offset]=seaHeightInput.changed_map_fields.altitude_byte;
  bytes[offset+1]=seaHeightInput.changed_map_fields.contour_byte;
  return bytes;
}

// Retain the exact shared-field edit table; this is input provenance, not a
// candidate/reference duration match or a second production rule parser.
export function seaHeightOverrideManifest(original,changed){
  const rows=bytes=>{const lines=bytes.toString('latin1').split('\n');let active=false;const out=[];
    for(let line=0;line<lines.length;line++){
      const text=lines[line].trim();if(text==='#TERRAIN'){active=true;continue;}
      if(active&&text.startsWith('#'))break;
      if(active&&text&&!text.startsWith(';'))out.push({line:line+1,fields:lines[line].split(';')[0].trimEnd().split(',').map(field=>field.trim())});
    }return out;};
  const before=rows(original),after=rows(changed);
  if(before.length!==20||after.length!==20)throw Error('Expected exactly twenty shared TERRAIN input rows');
  return before.map((row,index)=>{
    const next=after[index];if(row.line!==next.line||row.fields.length!==next.fields.length)throw Error('TERRAIN structure changed');
    for(let field=0;field<row.fields.length;field++)if(field!==4&&row.fields[field]!==next.fields[field])throw Error('Non-duration TERRAIN field changed');
    if(next.fields[4]!=='1'||!/^\d+$/.test(row.fields[4]))throw Error('Invalid shared TERRAIN duration input');
    return{row:index,line:row.line,land_name:row.fields[0],sea_name:row.fields[2],field_index:4,field:'shared_turns',old:Number(row.fields[4]),new:1,applies_to:['land','sea']};
  });
}
