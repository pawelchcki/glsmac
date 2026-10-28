// The work controller owns quote validation and payment. Choice selection is
// only a draft; this view returns consent only when its actual OK is activated.
return {
 init: (p) => {
  this.rows = []; this.texts = []; this.selected = 0; this.generation = 0;
  const data = p.create(' ', 500, 190, (body, finish) => { this.body = body; this.finish = finish; });
  this.header = data.header_text;
  data.on_keydown = (e) => {
   if (e.modifiers != {}) { return false; }
   if (e.code == 'UP') { this.select(0); return true; }
   if (e.code == 'DOWN') { this.select(1); return true; }
   if (e.code == 'ENTER') { this.finish(this.selected == 1); return true; }
   return false;
  };
  return data;
 },
 select: (selected) => {
  if (selected != 0 && selected != 1) { throw Error('Invalid height payment choice'); }
  this.selected = selected; let index = 0;
  for (row of this.rows) {
   row.class = 'popup-choice' + (index == selected ? ' popup-choice-active' : ''); index++;
  }
 },
 set: (data) => {
  const definition = data.definition;
  if (#sizeof(definition.choices) != 2 || #sizeof(definition.lines) < 1 || #sizeof(definition.lines) > 3) {
   throw Error('Invalid source-backed height confirmation');
  }
  this.generation = this.generation + 1; const generation = this.generation;
  for (node of this.rows) { node.remove(); } this.rows = [];
  for (node of this.texts) { node.remove(); } this.texts = [];
  if (#is_defined(this.ok)) { this.ok.remove(); }
  this.definition = #clone(definition); this.header.text = definition.caption;
  let top = 10;
  for (line of definition.lines) {
   this.texts :+ this.body.text({class: 'game-popup-text', text: line, left: 10, top: top, font: 'arialnb.ttf:14'});
   top += 18;
  }
  let index = 0;
  for (label of definition.choices) {
   const selected = index;
   const row = this.body.button({class: 'popup-choice', text: label, top: top + index * 24,
    left: 10, right: 10, height: 22, textalign: 'left'});
   row.on('click', (e) => { if (this.generation == generation) { this.select(selected); } return true; });
   this.rows :+ row; index++;
  }
  this.ok = this.body.button({class: 'game-popup-button', text: 'OK', left: 10, right: 10, top: 160, is_ok: true});
  this.ok.on('click', (e) => { if (this.generation == generation) { this.finish(this.selected == 1); } return true; });
  this.select(0);
 },
 on_hide: () => { this.generation = this.generation + 1; },
};
