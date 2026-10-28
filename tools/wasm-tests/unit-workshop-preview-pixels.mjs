// Candidate-only relation between two observed crops of the same pinned source
// component. Nonblack control colors define the material mask. The preview's
// other background colors are excluded; black voxels/alpha/original art are not
// independently identified by this comparison.
import assert from 'node:assert/strict';

export function compareWorkshopMaterialMask(frame,control,preview){
  assert.ok(Number.isInteger(frame.width)&&frame.width>0&&Number.isInteger(frame.height)&&frame.height>0);
  assert.equal(frame.data.length,frame.width*frame.height*4);
  const dimensions=crop=>{
    for(const key of ['left','right','top','bottom'])assert.ok(Number.isInteger(crop[key]),'Observed crop coordinates must be integer pixels');
    assert.ok(crop.left>=0&&crop.top>=0&&crop.right<=frame.width&&crop.bottom<=frame.height);
    assert.ok(crop.right>crop.left&&crop.bottom>crop.top);
    return{width:crop.right-crop.left,height:crop.bottom-crop.top};
  };
  const size=dimensions(control);assert.deepEqual(dimensions(preview),size,'Actual component crops must have equal dimensions');
  const rgb=(crop,x,y)=>{
    const at=((crop.top+y)*frame.width+crop.left+x)*4;
    return`${frame.data[at]},${frame.data[at+1]},${frame.data[at+2]}`;
  };
  const colors=new Map();let background=0;
  for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){
    const color=rgb(control,x,y);if(color==='0,0,0')background++;else colors.set(color,(colors.get(color)||0)+1);
  }
  const palette=[...colors].sort((a,b)=>b[1]-a[1]);
  assert.ok(palette.length>0,'Actual control must contain nonblack component material');
  assert.ok(palette[0][1]>100,'Actual control must contain substantial nonempty component geometry');
  assert.ok(background>0,'Actual black-background control must also contain background pixels');
  let matching=0,missing=0,wrong=0,extra=0;
  for(let y=0;y<size.height;y++)for(let x=0;x<size.width;x++){
    const expected=rgb(control,x,y),actual=rgb(preview,x,y),referenceMaterial=expected!=='0,0,0',actualMaterial=colors.has(actual);
    if(referenceMaterial){
      if(actual===expected)matching++;
      else if(actualMaterial)wrong++;
      else missing++;
    }else if(actualMaterial)extra++;
  }
  assert.deepEqual({missing,wrong,extra},{missing:0,wrong:0,extra:0},'Every reference material pixel must match exactly; no reference-palette material may appear outside its mask');
  return{crop_size:size,reference_palette:palette,reference_background_pixels:background,exact_material_pixels:matching,
    missing_material_pixels:missing,wrong_material_pixels:wrong,extra_reference_palette_pixels:extra,
    scope:'Exact candidate nonblack reference-material mask only; other preview background colors excluded; black voxels/alpha/original pixels unsupported'};
}
