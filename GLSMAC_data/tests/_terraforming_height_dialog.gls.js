return (behavior) => {
const consumer = #include('../default/game/terraforming_height_dialog');
const up = '#TERRACOSTUP\n#xs 320\n#caption Edited Ecologist\nPay $NUM0 to {raise} terrain.\nAvailable $NUM1.\n';
const down = '#TERRACOSTDOWN\n#caption Other Ecologist\n{lower} for $NUM0; treasury $NUM1.\n';
const pay = '#TERRAPAY\n#itemlist\nRetain terrain.\nUse $NUM0 credits.\n#END\n';
behavior.scenario('native source parser keeps height wording independent from actual quote amounts', () => {
 const definition = consumer.parse(test.parse_smac_text(up + down + pay, 'dialogs'));
 const rendered = consumer.render(definition, 'raise', 17, 93);
 test.assert(rendered.caption == 'Edited Ecologist');
 test.assert(rendered.lines == ['Pay 17 to raise terrain.', 'Available 93.']);
 test.assert(rendered.choices == ['Retain terrain.', 'Use 17 credits.']);
 test.assert(rendered.source_lines == ['Pay $NUM0 to {raise} terrain.', 'Available $NUM1.']);
 const other = consumer.render(definition, 'lower', 5, 44);
 test.assert(other.caption == 'Other Ecologist' && other.lines == ['lower for 5; treasury 44.']);
 rendered.source_lines[0] = 'changed'; rendered.choices[0] = 'changed';
 test.assert(consumer.render(definition, 'raise', 2, 10).choices[0] == 'Retain terrain.');
});
let index = 0;
for (raw of [down + pay, up + pay, up + down + '#TERRAPAY\nCancel.\nPay.\n#END\n',
 '#TERRACOSTUP\n#caption One\n#caption Two\nPay $NUM0.\n' + down + pay,
 '#TERRACOSTUP\n#caption One\nUnknown $NUM2.\n' + down + pay,
 '#TERRACOSTUP\n#caption One\nUnknown {shape}.\n' + down + pay,
 up + down + '#TERRAPAY\n#itemlist\nCancel.\n#END\n']) {
 behavior.scenario('unsupported height source must not produce a confirmable quote ' + #to_string(index), () => {
  let rejected = false;
  try { consumer.parse(test.parse_smac_text(raw, 'dialogs')); } catch { : (e) => { rejected = true; } }
  test.assert(rejected);
 }); index++;
}
behavior.scenario('height renderer rejects invented numeric or unsupported action inputs', () => {
 const definition = consumer.parse(test.parse_smac_text(up + down + pay, 'dialogs'));
 for (request of [['raise', 1.0, 10], ['raise', 1, (0 - 1)], ['raise', (0 - 1), 10], ['level', 1, 10]]) {
  let rejected = false;
  try { consumer.render(definition, request[0], request[1], request[2]); } catch { : (e) => { rejected = true; } }
  test.assert(rejected);
 }
});

behavior.scenario('mounted height choices remain draft until OK and stale replaced rows cannot grant consent', () => {
 const view = #include('./_ui_mocks').display(); const results = [];
 const p = {create: (title, width, height, generator) => {
  const frame = view.root.window({width: width, height: height}); const body = frame.panel({});
  const header = frame.text({text: title}); generator(body, (value) => { results :+ value; });
  const data = {}; data.el = frame; data.header_text = header; return data;
 }};
 const dialog = #include('../default/ui/parts/game/popup/terraforming_height'); const data = dialog.init(p);
 const definition = consumer.render(consumer.parse(test.parse_smac_text(up + down + pay, 'dialogs')), 'raise', 17, 93);
 dialog.set({definition: definition});
 test.assert(dialog.selected == 0 && #sizeof(results) == 0);
 dialog.rows[1].emit('click', {});
 test.assert(dialog.selected == 1 && #sizeof(results) == 0, 'Selecting Expend is not consent/payment');
 let stale_row = null; let stale_ok = null;
 for (handler of dialog.rows[1].get_handlers()) { if (handler.name == 'click') { stale_row = handler.callback; } }
 for (handler of dialog.ok.get_handlers()) { if (handler.name == 'click') { stale_ok = handler.callback; } }
 test.assert(stale_row != null && stale_ok != null);
 dialog.set({definition: definition}); stale_row({}); stale_ok({});
 test.assert(dialog.selected == 0 && #sizeof(results) == 0, 'Old row/OK callbacks cannot submit a new quote');
 data.on_keydown({code: 'ENTER', modifiers: {}});
 test.assert(results == [false], 'Default OK is Cancel');
 dialog.rows[1].emit('click', {}); dialog.ok.emit('click', {});
 test.assert(results == [false, true]);
 dialog.on_hide(); dialog.ok.emit('click', {});
 test.assert(results == [false, true], 'Hidden button callback is retired');
});
};
