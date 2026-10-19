// Production custom-size dialog and popup manager, with the display boundary
// controlled. Native Input emits 'input' for focused Enter; this suite delivers
// that event directly and makes no claim about rendered keyboard routing or
// original-game parity.
const behavior = #include('./_behavior');
const mocks = #include('./_ui_mocks');
const dimension_text = #include('./_dimension_text_fixture');
const customize_mapsize = #include('../default/ui/parts/mainmenu/steps/customize_mapsize');

const make_picker = (map_type) => {
	const f = mocks.menu_popup();
	f.state.routes = [];
	f.m.popup = f.popup;
	f.m.settings = { global: { map: { type: map_type, size_x: 112, size_y: 56, filename: 'retained.GSM', preset_level: 2 } } };
	dimension_text.install(f.m);
	f.m.steps = {
		select_difficulty_level: (current) => { f.state.routes :+ 'difficulty'; },
		customize_ocean_coverage: (current) => { f.state.routes :+ 'ocean'; },
	};
	// A real previous popup makes back/cancel restore the parent screen.
	f.popup.show({ title: 'Map Size', width: 480, height: 180 });
	customize_mapsize(f.m);
	f.inputs = f.view.live('input');
	test.assert(#sizeof(f.inputs) == 2 && f.inputs[0].value == '40' && f.inputs[1].value == '80');
	return f;
};

const assert_settings = (f, width, height, map_type, preset) => {
	const expected = #is_defined(preset) ? preset : 99;
	test.assert(f.m.settings.global.map == { type: map_type, size_x: width, size_y: height, filename: 'retained.GSM', preset_level: expected });
};

const assert_submitted = (f, width, height, map_type) => {
	assert_settings(f, width, height, map_type, 99);
	test.assert(f.state.routes == [map_type == 'random' ? 'difficulty' : 'ocean']);
	test.assert(#sizeof(f.view.live('input')) == 0 && #sizeof(f.view.live('window')) == 1);
	test.assert(f.view.find('window', 'title', 'Map Size').title == 'Map Size');
	test.assert(f.state.reset == 0 && f.state.exit == 0);
	// The real popup removes old inputs, so delayed delivery cannot submit twice.
	f.inputs[0].emit('input', { value: '60' });
	f.inputs[1].emit('input', { value: '80' });
	test.assert(#sizeof(f.state.routes) == 1);
};

for (map_type of ['random', 'custom']) {
	for (field of [0, 1]) {
		behavior.scenario('Enter in dimension ' + #to_string(field) + ' submits the ' + map_type + ' map route', () => {
			const f = make_picker(map_type);
			f.inputs[0].value = '60';
			f.inputs[1].value = '80';
			const value = f.inputs[field].value;
			test.assert(f.inputs[field].emit('input', { value: value }) == true, 'Enter from either input must submit the dialog');
			assert_submitted(f, 120, 80, map_type);
		});
	}
	behavior.scenario('OK click retains the same ' + map_type + ' map submission', () => {
		const f = make_picker(map_type);
		f.inputs[0].value = '60';
		f.inputs[1].value = '80';
		test.assert(f.view.find('button', 'text', 'OK').emit('click', {}) == true);
		assert_submitted(f, 120, 80, map_type);
	});
}

for (action of ['complete', 'cancel']) {
	behavior.scenario('popup ' + action + ' distinguishes completion from scope and group cancellation', () => {
		const f = mocks.menu_popup();
		const destroyed = [];
		f.popup.show({ title: 'Caller', width: 480, height: 180 });
		f.popup.show({ title: 'Scope', width: 480, height: 180, cancel_scope: 'test_setup', cancel_group: 'questions', destructor: () => { destroyed :+ 'scope'; } });
		f.popup.show({ title: 'Question', width: 480, height: 180, cancel_group: 'questions', destructor: () => { destroyed :+ 'question'; } });
		f.popup.show({ title: 'Current', width: 480, height: 180, cancel_through: 'test_setup', cancel_group: 'questions', destructor: () => { destroyed :+ 'current'; } });
		if (action == 'complete') {
			f.popup.complete();
			test.assert(destroyed == ['current'] && #sizeof(f.manager.data_stack) == 3);
			test.assert(f.view.find('window', 'title', 'Question').title == 'Question');
			f.popup.back();
		} else { f.popup.back(); }
		test.assert(destroyed == ['current', 'question', 'scope']);
		test.assert(#sizeof(f.manager.data_stack) == 1 && #sizeof(f.view.live('window')) == 1);
		test.assert(f.view.find('window', 'title', 'Caller').title == 'Caller');
		test.assert(f.state.reset == 0 && f.state.exit == 0);
	});
}

for (c of [
	['text width', 'nonsense', '80', 0],
	['trailing height text', '120', '80junk', 1],
	['fractional horizontal size', '60.5', '80', 0],
	['odd height', '120', '3', 1],
	['width below minimum', '1', '80', 0],
	['height below minimum', '120', '0', 1],
	['width above maximum', '2049', '80', 0],
	['height above maximum', '120', '4098', 1],
	['decimal width', '120.0', '80', 0],
	['decimal height', '120', '2.5', 1],
	['empty width', '', '80', 0],
	['empty height', '120', '', 1],
]) {
	behavior.scenario('Enter rejects ' + c[0] + ' and permits correction', () => {
		const f = make_picker('random');
		f.inputs[0].value = c[1];
		f.inputs[1].value = c[2];
		const field = c[3];
		const value = f.inputs[field].value;
		test.assert(f.inputs[field].emit('input', { value: value }) == true);
		assert_settings(f, 112, 56, 'random');
		test.assert(f.state.routes == [] && #sizeof(f.view.live('input')) == 2);
		test.assert(f.view.find('window', 'title', 'Custom Map Size').title == 'Custom Map Size');
		test.assert(f.view.find('text', 'text', 'Use whole horizontal and even vertical sizes within the displayed ranges.').text == 'Use whole horizontal and even vertical sizes within the displayed ranges.');
		f.inputs[0].value = '60';
		f.inputs[1].value = '80';
		test.assert(f.inputs[field].emit('input', { value: field == 0 ? '60' : '80' }) == true);
		assert_submitted(f, 120, 80, 'random');
	});
}

for (c of [['2', '2', 4, 2], ['2048', '4096', 4096, 4096], [' 60 ', ' 80 ', 120, 80]]) {
	behavior.scenario('Enter accepts dimension boundaries or whitespace ' + c[0] + 'x' + c[1], () => {
		const f = make_picker('custom');
		f.inputs[0].value = c[0];
		f.inputs[1].value = c[1];
		test.assert(f.inputs[1].emit('input', { value: c[1] }) == true);
		assert_submitted(f, c[2], c[3], 'custom');
	});
}

for (cancel of ['button', 'escape']) {
	behavior.scenario(cancel + ' cancellation preserves dimensions after rejected Enter', () => {
		const f = make_picker('custom');
		f.inputs[0].value = '60.5';
		f.inputs[1].value = '80';
		f.inputs[0].emit('input', { value: '60.5' });
		if (cancel == 'button') { f.view.find('button', 'text', 'Cancel').emit('click', {}); }
		else { f.view.find('window', 'title', 'Custom Map Size').emit('keydown', { code: 'ESCAPE', modifiers: [] }); }
		assert_settings(f, 112, 56, 'custom');
		test.assert(f.state.routes == [] && #sizeof(f.view.live('input')) == 0);
		test.assert(f.view.find('window', 'title', 'Map Size').title == 'Map Size');
		f.inputs[0].emit('input', { value: '60' });
		test.assert(f.state.routes == [] && f.state.reset == 0 && f.state.exit == 0);
	});
}

// Recorded ui.map_size_keyboard.v1 observations cover only the untouched
// dialog's final Enter/Escape menu. Edited values, Cancel clicks and subsequent
// navigation below are additional GLSMAC regressions, not reference evidence.
const make_setup = (map_type) => {
	const f = { state: { reset: 0, exit: 0 }, m: {} };
	f.view = mocks.display();
	f.m.root = f.view.root;
	f.m.glsmac = {
		config: {},
		reset: () => { f.state.reset = f.state.reset + 1; },
		exit: () => { f.state.exit = f.state.exit + 1; },
	};
	f.m.glsmac.ui = f.view.ui;
	f.sliding = #include('../default/ui/parts/mainmenu/sliding')(f.m);
	f.popup = #include('../default/ui/parts/mainmenu/popup')(f.m);
	f.manager = #include('../default/ui/parts/mainmenu/manager')('sliding', f.sliding);
	f.manager.register('popup', f.popup);
	f.manager.data_stack = [];
	f.m.sliding = f.sliding;
	f.m.popup = f.popup;
	f.m.settings = { global: {
		map: { type: map_type, size_x: 112, size_y: 56, filename: 'retained.GSM', ocean_coverage: 0.6 },
		rules: { difficulty_levels: ['Citizen', 'Specialist'] },
	} };
	#include('./_world_size_fixture')(f.m.settings);
	dimension_text.install(f.m);
	f.m.randomize_map = () => {};
	f.m.set_customize_preview = (data) => {};
	f.m.customize_preview_defaults = { ocean_coverage_type: 3 };
	f.m.steps = {};
	for (name of ['start_game', 'select_mapsize', 'customize_mapsize', 'select_difficulty_level', 'customize_ocean_coverage']) {
		f.m.steps[name] = #include('../default/ui/parts/mainmenu/steps/' + name);
	}
	f.choose = (index) => {
		f.manager.select(index);
		const stack = f.manager.data_stack;
		const callback = stack[#sizeof(stack) - 1].data.entries[index][1];
		f.sliding.hide();
		callback();
	};
	f.m.steps.start_game(f.m);
	f.choose(map_type == 'random' ? 0 : 1);
	f.choose(5);
	f.inputs = f.view.live('input');
	return f;
};

for (map_type of ['random', 'custom']) {
	for (cancel of ['escape', 'button']) {
		behavior.scenario(map_type + ' custom-size ' + cancel + ' restores the selected map-type caller', () => {
			const f = make_setup(map_type);
			f.inputs[0].value = '60';
			f.inputs[1].value = '80';
			if (cancel == 'button') { f.view.find('button', 'text', 'Cancel').emit('click', {}); }
			else { f.view.find('window', 'title', 'Custom Map Size').emit('keydown', { code: 'ESCAPE', modifiers: [] }); }
			test.assert(#sizeof(f.manager.data_stack) == 1, 'cancel unwinds both the custom dialog and size question');
			const label = map_type == 'random' ? 'Make Random Map' : 'Customize Random Map';
			test.assert(f.view.find('button', 'text', label).class == 'menublock-item-active');
			test.assert(f.m.settings.global.map.size_x == 112 && f.m.settings.global.map.size_y == 56);
			test.assert(f.m.settings.global.map.type == map_type && f.m.settings.global.map.filename == 'retained.GSM');
			test.assert(#sizeof(f.view.live('input')) == 0 && #sizeof(f.view.live('window')) == 0);
			test.assert(f.state.reset == 0 && f.state.exit == 0);
		});
	}
	behavior.scenario(map_type + ' custom-size success retains the setup scope for subsequent navigation', () => {
		const f = make_setup(map_type);
		f.inputs[0].value = '60';
		f.inputs[1].value = '80';
		f.inputs[0].emit('input', { value: '60' });
		test.assert(#sizeof(f.manager.data_stack) == 3, 'successful confirmation preserves the size scope');
		const title = map_type == 'random' ? 'Pick a difficulty level' : 'Select ocean coverage';
		test.assert(f.view.find('button', 'text', title).class == 'menublock-item-active');
		test.assert(f.m.settings.global.map.size_x == 120 && f.m.settings.global.map.size_y == 80);
		f.sliding.back();
		const label = map_type == 'random' ? 'Make Random Map' : 'Select size of planet';
		test.assert(f.view.find('button', 'text', label).class == 'menublock-item-active');
		test.assert(#sizeof(f.manager.data_stack) == (map_type == 'random' ? 1 : 2));
		test.assert(f.m.settings.global.map.size_x == 120 && f.m.settings.global.map.size_y == 80);
	});
}

behavior.scenario('opening and confirming untouched defaults declares Custom size kind', () => {
	const f = make_picker('random');
	test.assert(f.m.settings.global.map.preset_level == 99);
	f.view.find('button', 'text', 'OK').emit('click', {});
	assert_submitted(f, 80, 80, 'random');
});
