// The first implemented custom rule. Other rule effects remain separate work.
return (i) => {
	const source = #include('../../../../game/research_dialog').load_rules(i.glsmac);
	const state = {blind: i.settings.global.rules.get_blind_research(), generation: 0, confirm: null};
	i.popup.show({
		title: source.caption, width: 520, height: 180,
		generator: (body) => {
			state.generation = state.generation + 1; const generation = state.generation;
			const check = body.button({class: 'popup-button', text: state.blind ? 'X' : '', left: 15, top: 18, width: 26, height: 26});
			const label = body.button({class: 'popup-button', text: source.blind, left: 50, right: 15, top: 18, height: 26, textalign: 'left'});
			const toggle = (e) => { if (state.generation == generation) { state.blind = !state.blind; check.text = state.blind ? 'X' : ''; } return true; };
			check.on('click', toggle); label.on('click', toggle);
			const reset = body.button({class: 'popup-button', text: source.reset, bottom: 55, left: 120, right: 120, height: 26});
			reset.on('click', (e) => { if (state.generation == generation) { state.blind = true; check.text = 'X'; } return true; });
			const ok = body.button({class: 'popup-button', text: source.labels.ok, left: 25, bottom: 15, width: 200, height: 26, is_ok: true});
			const cancel = body.button({class: 'popup-button', text: source.labels.cancel, right: 25, bottom: 15, width: 200, height: 26, is_cancel: true});
			const confirm = () => {
				if (state.generation != generation) { return true; }
				i.pending_research_blind = state.blind; state.generation = state.generation + 1;
				i.steps.select_faction(i); return true;
			};
			state.confirm = confirm;
			ok.on('click', (e) => { return confirm(); });
			cancel.on('click', (e) => { if (state.generation == generation) { state.generation = state.generation + 1; i.popup.back(); } return true; });
			body.on('remove', () => { if (state.generation == generation) { state.generation = state.generation + 1; } });
		},
		on_keydown: (e) => { if (e.modifiers == {} && e.code == 'ENTER' && state.confirm != null) { return state.confirm(); } return false; },
	});
};
