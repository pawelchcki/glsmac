return {
 init: (p) => {
  this.active = false; this.generation = 0; this.click_id = null; this.click_timer = null;
  p.ui.class('base-operations-row').set({background: 'rgb(8,32,32)', border: 'transparent,1'});
  const data = p.create(' ', 640, 500, (body, finish) => { this.body = body; this.finish = finish; });
  this.header = data.header_text;
  data.on_keydown = (e) => {
   if (this.active && e.modifiers == {} && e.code == 'ESCAPE') { this.finish(false); return true; }
   return this.active;
  };
  data.el.on('remove', () => { this.active = false; this.generation = this.generation + 1; this.disarm(); });
  return data;
 },
 disarm: () => {
  if (this.click_timer != null) { this.click_timer.stop(); this.click_timer = null; }
  this.click_id = null;
 },
 paint_selection: (id) => {
  for (row of this.rows) { row.el.border = row.id == id ? 'rgb(0,235,0),1' : 'transparent,1'; }
 },
 set: (input) => {
  this.disarm(); this.generation = this.generation + 1; const generation = this.generation;
  this.body.clear(); this.header.text = input.title; this.rows = []; this.controller = input.controller;
  this.tabs = [];
  for (tab of [[input.definition.production, 0], [input.definition.citizens, 1], [input.definition.garrison, 2]]) {
   const button = this.body.button({class: 'game-popup-button', text: tab[0] + '', left: 210 * tab[1], top: 0, width: 210, height: 24});
   button.active = tab[1] == 0; this.tabs :+ button;
  }
  const list = this.body.scrollview({left: 0, right: 0, top: 28, bottom: 40, has_hscroll: false, vscroll_class: 'default-scroll-v'});
  let top = 0;
  for (record of input.rows) {
   const id = record.id; const identity = record.base;
   const row = {id: id};
   row.el = list.button({class: 'base-operations-row', left: 0, right: 0, top: top, height: 43, border: 'transparent,1'});
   const city = {}; city.base = identity;
   row.el.widget({type: 'base-preview', data: city, left: 0, top: 2, width: 48, height: 38});
   row.name = row.el.text({class: 'game-popup-text', text: #uppercase(record.name), left: 52, top: 8, font: 'arialnb.ttf:17'});
   row.project = row.el.text({class: 'game-popup-text', text: record.project + '', left: 275, top: 4, font: 'arialnb.ttf:16'});
   // Current native stores/prices are displayed truthfully. Their known
   // original-game differences remain outside this navigation contract.
   row.progress = row.el.text({class: 'game-popup-text', text: #to_string(record.minerals) + ' / ' + #to_string(record.cost), left: 275, top: 23, font: 'arialnb.ttf:13'});
   row.el.on('click', (e) => {
    if (!this.active || generation != this.generation || this.controller.resolve(id) != identity) { return true; }
    const twice = this.click_id == id;
    this.disarm();
    if (!this.controller.select(id)) { return true; }
    this.paint_selection(id);
    if (twice) { this.finish(id); return true; }
    this.click_id = id;
    // Application click cadence only; exact original timing is unobserved.
    this.click_timer = row.el.timer(400, () => {
     if (generation == this.generation) { this.click_id = null; this.click_timer = null; }
     return false;
    });
    return true;
   });
   this.rows :+ row; top = top + 43;
  }
  this.paint_selection(input.selected);
  this.datalinks = this.body.button({class: 'game-popup-button', text: input.definition.datalinks + '', align: 'bottom left', left: 70, bottom: 6, width: 220, height: 26});
  this.close = this.body.button({class: 'game-popup-button', text: input.definition.close + '', align: 'bottom right', right: 70, bottom: 6, width: 220, height: 26});
  this.close.on('click', () => { if (this.active && generation == this.generation) { this.finish(false); } return true; });
 },
 on_show: () => { this.active = true; },
 on_hide: () => { this.active = false; this.generation = this.generation + 1; this.disarm(); },
};
