// Optional candidate invariant fixture. These are real native constructors and
// dispatch paths in the installed browser, never an original-game observation.
import assert from 'node:assert/strict';

export function instrumentNativeControlFixture(scripts) {
  const path='GLSMAC_data/default/ui/parts/mainmenu/sliding.gls.js';
  const marker='current_menublock.right = 0;';
  assert.equal(scripts[path].split(marker).length,2);
  scripts[path]=scripts[path].replace(marker,`${marker}
    const native_probe = m.root.panel({left: 40, top: 40, width: 450, height: 310, zindex: 1.0});
    native_probe.presentation_role('dialog', 'native-control-fixture');
    const native_button = native_probe.button({left: 20, top: 20, width: 200, height: 26, text: 'Mixed label', transform: 'uppercase', font: 'arialnb.ttf:18', sound: 'ok.wav'});
    native_button.presentation_role('button', 'native-control-fixture.button');
    const native_choices = native_probe.choicelist({left: 20, top: 110, width: 200, height: 70, itemheight: 26, keyboard: true, items: [['alpha', 'Same label'], ['beta', 'Same label']], value: 'alpha'});
    native_choices.presentation_role('choice-list', 'native-control-fixture.choices');
    const native_select = native_probe.select({left: 240, top: 65, width: 180, height: 26, itemheight: 26, items: [['one', 'Same select label'], ['two', 'Same select label']]});
    native_select.presentation_role('container', 'native-control-fixture.select');
    native_select.value = 'two';
    const native_editor = native_probe.input({left: 20, top: 65, width: 200, height: 26, font: 'arialnb.ttf:18', value: 'ABC', max_length: 12});
    native_editor.presentation_role('text-editor', 'native-control-fixture.editor');
    const native_capped = native_probe.input({left: 240, top: 110, width: 180, height: 26, font: 'arialnb.ttf:18', max_length: 3, value: 'ABC'});
    native_capped.presentation_role('text-editor', 'native-control-fixture.capped');
    native_capped.value = 'ABCD';
    native_capped.on('input', (event) => { #print('PRESENTATION_NATIVE_CAPPED_VALUE|' + event.value); return true; });
    const native_empty = native_probe.input({left: 240, top: 145, width: 180, height: 26, font: 'arialnb.ttf:18'});
    native_empty.presentation_role('text-editor', 'native-control-fixture.empty');
    const paragraphs = #include('../game/opening');
    paragraphs.paragraphs(['Actual source paragraph for native layout fragments'], 190, 120, native_probe);
    native_editor.on('input', () => {
      native_choices.items = [['beta', 'Same label'], ['gamma', 'Same label']];
      native_choices.value = 'gamma';
      native_probe.left = 85; native_probe.width = 500;
      const transient_surface = native_probe.surface({width: 5, height: 5});
      transient_surface.remove();
      const transient_sound = native_probe.sound({sound: 'ok.wav', autoplay: true});
      transient_sound.stop(); transient_sound.remove();
      #print('PRESENTATION_NATIVE_CONTROL_MUTATED');
      return true;
    });
    #print('PRESENTATION_NATIVE_CONTROL_READY');
  `);
}
