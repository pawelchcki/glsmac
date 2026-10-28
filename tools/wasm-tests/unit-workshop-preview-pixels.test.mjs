// Synthetic protocol checks only; no asset-derived artwork or geometry stored.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compareWorkshopMaterialMask} from './unit-workshop-preview-pixels.mjs';
const primary=[30,70,90],secondary=[120,100,10],panel=[4,8,12];
const fixture=(single=false)=>{
  const frame={width:72,height:24,data:new Uint8Array(72*24*4)};
  const set=(x,y,color)=>frame.data.set([...color,255],(y*frame.width+x)*4);
  for(let y=0;y<24;y++)for(let x=0;x<72;x++)set(x,y,x<32?[0,0,0]:panel);
  for(let y=3;y<21;y++)for(let x=3;x<28&&x<y+12;x++){
    const color=!single&&x===6?secondary:primary;set(x,y,color);set(x+40,y,color);
  }
  return{frame,set,control:{left:0,top:0,right:32,bottom:24},preview:{left:40,top:0,right:72,bottom:24}};
};
const compare=f=>compareWorkshopMaterialMask(f.frame,f.control,f.preview);

test('two material colors match exactly over a different excluded preview background',()=>{
  const f=fixture(),r=compare(f);assert.equal(r.reference_palette.length,2);assert.ok(r.exact_material_pixels>100);
  assert.equal(r.missing_material_pixels+r.wrong_material_pixels+r.extra_reference_palette_pixels,0);
});
test('a valid single-color component does not acquire an invented palette-diversity requirement',()=>{
  const r=compare(fixture(true));assert.equal(r.reference_palette.length,1);assert.ok(r.exact_material_pixels>100);
});
test('missing or blank control fails instead of authorizing a background-only preview',()=>{
  const f=fixture();for(let y=0;y<24;y++)for(let x=0;x<32;x++)f.set(x,y,[0,0,0]);assert.throws(()=>compare(f));
});
test('blank preview fails even with a valid visible component control',()=>{
  const f=fixture();for(let y=0;y<24;y++)for(let x=40;x<72;x++)f.set(x,y,panel);assert.throws(()=>compare(f));
});
test('a wrong color inside the material mask fails',()=>{
  const f=fixture();f.set(45,5,[200,3,4]);assert.throws(()=>compare(f));
});
test('swapping reference palette materials at an occupied pixel fails',()=>{
  const f=fixture();f.set(45,5,secondary);assert.throws(()=>compare(f));
});
test('an additional reference-material pixel outside the reference mask fails',()=>{
  const f=fixture();f.set(40,0,primary);assert.throws(()=>compare(f));
});
test('a one-pixel displacement cannot pass by retaining the same palette and counts',()=>{
  const f=fixture();const copy=f.frame.data.slice();
  for(let y=0;y<24;y++)for(let x=40;x<72;x++)f.set(x,y,x===40?panel:[...copy.subarray((y*72+x-1)*4,(y*72+x-1)*4+3)]);
  assert.throws(()=>compare(f));
});
test('a solid same-color rectangle cannot stand in for the component',()=>{
  const f=fixture();for(let y=0;y<24;y++)for(let x=40;x<72;x++)f.set(x,y,primary);assert.throws(()=>compare(f));
});
test('empty or unequal or out-of-frame observed crops fail closed',()=>{
  const f=fixture();assert.throws(()=>compareWorkshopMaterialMask(f.frame,{...f.control,right:0},f.preview));
  assert.throws(()=>compareWorkshopMaterialMask(f.frame,f.control,{...f.preview,right:71}));
  assert.throws(()=>compareWorkshopMaterialMask(f.frame,f.control,{...f.preview,right:73}));
});
