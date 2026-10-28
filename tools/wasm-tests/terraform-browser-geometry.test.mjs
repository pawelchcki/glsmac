// Declared native wire integrity, not browser or original-game execution.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TerraformGeometry,nativeToCanvas} from './terraform-browser-geometry.mjs';
const events=[
 {seq:1,kind:'node.create',target:'n1',data:{tag:'$button',parent:null}},
 {seq:2,kind:'semantic.role',target:'n1',data:{role:'terraform-header',source:'left_menu_terraform'}},
 {seq:3,kind:'node.property',target:'n1',data:{key:'text',value:'TERRAFORM'}},
 {seq:4,kind:'semantic.geometry',target:'n1',data:{area:'effective',left:1.0000001192092896,top:440,right:139,bottom:457,zindex:0.9}},
];
const packet=rows=>({enabled:true,dropped:0,events:structuredClone(rows)});
test('actual semantic identity and native effective geometry survive exact wire replay',()=>{
 const geometry=new TerraformGeometry();geometry.ingest(packet(events));
 const target=geometry.button('terraform-header','left_menu_terraform','TERRAFORM',{width:1024,height:768});
 assert.equal(target.bounds.left,1.0000001192092896);assert.equal(target.y,448.5);
 // A requested relative y=434 is not an alternative effective rectangle.
 assert.notEqual(target.y,434);
 const hit=packet([{seq:5,kind:'node.create',target:'n2',data:{tag:'$text',parent:'n1'}},{seq:6,kind:'input.ui-transition',target:'n2',data:{type:'mouseover'}}]);
 geometry.ingest(hit);geometry.assertPointerHit(hit,target);
});
test('missing duplicated mismatched and invalid native targets fail closed',()=>{
 for(const mutation of ['missing','duplicate','label','tag','outside','empty','nan','dropped']){
  const rows=structuredClone(events);const value=packet(rows);
  if(mutation==='missing')rows.splice(3,1);
  if(mutation==='duplicate')rows.push({seq:5,kind:'semantic.role',target:'n3',data:{role:'terraform-header',source:'left_menu_terraform'}});
  if(mutation==='label')rows[2].data.value='ACTION';
  if(mutation==='tag')rows[0].data.tag='$text';
  if(mutation==='outside')rows[3].data.right=1025;
  if(mutation==='empty')rows[3].data.bottom=440;
  if(mutation==='nan')rows[3].data.top=NaN;
  value.events=rows;if(mutation==='dropped')value.dropped=1;
  const geometry=new TerraformGeometry();assert.throws(()=>{geometry.ingest(value);geometry.button('terraform-header','left_menu_terraform','TERRAFORM',{width:1024,height:768});});
 }
});
test('unrelated pointer ingress cannot masquerade as a semantic target hit',()=>{
 const geometry=new TerraformGeometry();geometry.ingest(packet(events));
 const target=geometry.button('terraform-header','left_menu_terraform','TERRAFORM',{width:1024,height:768});
 assert.throws(()=>geometry.assertPointerHit(packet([{seq:5,kind:'input.ui-transition',target:'other',data:{type:'mouseover'}}]),target));
 assert.throws(()=>geometry.assertPointerHit(packet([{seq:5,kind:'input.ui-transition',target:'n1',data:{type:'mouseout'}}]),target));
 assert.throws(()=>geometry.ingest(packet(events)));
});

test('native pointer conversion uses observed viewport dimensions rather than a fixed framebuffer',()=>{
 assert.deepEqual(nativeToCanvas(640,360,{width:1280,height:720},{x:7,y:11,width:640,height:360}),{x:327,y:191});
 assert.throws(()=>nativeToCanvas(0,0,{width:0,height:720},{x:0,y:0,width:640,height:360}));
});
