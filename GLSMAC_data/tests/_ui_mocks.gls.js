// Deterministic native/display boundary for script interaction tests.
// This is deliberately not a renderer: emit explicitly delivers an event, and
// geometry, hit testing, keyboard routing and asset loading are not simulated.
// Owned listen() registrations and timers follow ui/dom/Object.cpp cleanup.
const events = () => {
	const target = {};
	target.handlers = [];
	target.on = (name, callback) => {
		target.handlers :+ { name: name, callback: callback, active: true };
		return #sizeof(target.handlers) - 1;
	};
	target.off = (id) => { target.handlers[id].active = false; };
	target.emit = (name, data) => {
		let result = false;
		for (handler of target.handlers) {
			if (handler.active && handler.name == name) {
				result = handler.callback(data);
			}
		}
		return result;
	};
	target.count = (name) => {
		let count = 0;
		for (handler of target.handlers) {
			if (handler.active && handler.name == name) { count++; }
		}
		return count;
	};
	target.clear = () => {
		for (handler of target.handlers) { handler.active = false; }
	};
	return target;
};

const display = () => {
	const result = {};
	result.nodes = [];
	result.timers = [];
	result.styles = {};
	const create = (kind, properties) => {
		const node = {};
		for (key in properties) { node[key] = properties[key]; }
		node.kind = kind;
		node.children = [];
		node.listeners = [];
		node.timers = [];
		node.removed = false;
		node.visible = true;
		node.active = false;
		node.plays = 0;
		node.stops = 0;
		const handlers = events();
		node.on = handlers.on;
		node.emit = handlers.emit;
		node.handler_count = handlers.count;
		node.is_removed = () => { return node.removed; };
		node.is_visible = () => { return node.visible; };
		node.play_count = () => { return node.plays; };
		node.stop_count = () => { return node.stops; };
		node.show = () => { node.visible = true; };
		node.hide = () => { node.visible = false; };
		node.play = () => { node.plays = node.plays + 1; };
		node.stop = () => { node.stops = node.stops + 1; };
		node.addclass = (name) => { node.class = name; };
		node.removeclass = (name) => { node.class = ''; };
		node.listen = (object, name, callback) => {
			const listener = { id: object.on(name, callback) };
			listener.object = object;
			node.listeners :+ listener;
			return #sizeof(node.listeners) - 1;
		};
		node.unlisten = (id) => {
			const listener = node.listeners[id];
			listener.object.off(listener.id);
		};
		node.timer = (interval, callback) => {
			const timer = { interval: interval, running: true, ticks: 0 };
			timer.stop = () => { timer.running = false; };
			timer.tick = () => {
				if (!timer.running) { return false; }
				timer.ticks = timer.ticks + 1;
				const keep = callback();
				if (keep != true) { timer.running = false; }
				return timer.running;
			};
			node.timers :+ timer;
			result.timers :+ timer;
			return timer;
		};
		node.remove = () => {
			if (!node.removed) {
				node.removed = true;
				node.visible = false;
				for (child of node.children) { child.remove(); }
				for (listener of node.listeners) { listener.object.off(listener.id); }
				for (timer of node.timers) { timer.stop(); }
				// Native Object::Destroy notifies its own removal handlers.
				handlers.emit('remove', {});
				handlers.clear();
			}
		};
		node.clear = () => {
			for (child of node.children) { child.remove(); }
			node.children = [];
		};
		// Native Window disables Panel factories and forwards only this subset
		// from its body (Window.cpp / Container::ForwardFactories).
		const factories = kind == 'window'
			? ['surface', 'group', 'panel', 'window', 'text', 'button', 'input', 'sound']
			: ['area', 'panel', 'window', 'surface', 'text', 'input', 'button', 'scrollview', 'listview', 'choicelist', 'widget', 'sound'];
		for (tag of factories) {
			const child_kind = tag;
			if (!#is_defined(node[child_kind])) {
				node[child_kind] = (props) => {
					const child = create(child_kind, props);
					node.children :+ child;
					return child;
				};
			}
		}
		result.nodes :+ node;
		return node;
	};
	result.root = create('root', {});
	result.ui = events();
	result.ui.root = result.root;
	result.ui.get_height = () => { return 768; };
	result.ui.class = (name) => {
		if (!#is_defined(result.styles[name])) {
			const style = {};
			style.set = (props) => { return style; };
			style.extend = (parent_name) => { return style; };
			result.styles[name] = style;
		}
		return result.styles[name];
	};
	result.find = (kind, key, value) => {
		for (node of result.nodes) {
			if (!node.removed && node.kind == kind && node[key] == value) { return node; }
		}
		throw Error('Display node not found: ' + kind + '/' + key + '/' + #to_string(value));
	};
	result.live = (kind) => {
		const found = [];
		for (node of result.nodes) {
			if (!node.removed && node.kind == kind) { found :+ node; }
		}
		return found;
	};
	result.running_timers = () => {
		let count = 0;
		for (timer of result.timers) { if (timer.running) { count++; } }
		return count;
	};
	return result;
};

// Shared fixtures construct real production components around that boundary.
const game_popup = (sliding) => {
	const view = display();
	const state = { closed_menus: 0, results: [] };
	const p = {};
	p.ui = view.ui;
	p.game = {};
	p.modules = { bottom_bar: { height: 256 }, menu: { close_all: () => { state.closed_menus = state.closed_menus + 1; } } };
	const module = #include('../default/ui/parts/game/popup/popup');
	// Isolate these shipped popup definitions from the unrelated base screen.
	module.available_popups = ['turn_confirmation', 'please_dont_go'];
	module.no_sliding = !sliding;
	module.init(p);
	const result = {};
	result.view = view;
	result.module = module;
	result.state = state;
	result.show = (name) => { module.show(name, (value) => { state.results :+ value; }); };
	return result;
};

const menu_popup = () => {
	const view = display();
	const state = { reset: 0, exit: 0 };
	const m = {};
	m.root = view.root;
	m.glsmac = { config: {}, reset: () => { state.reset = state.reset + 1; }, exit: () => { state.exit = state.exit + 1; } };
	const popup = #include('../default/ui/parts/mainmenu/popup')(m);
	// popup.manager was placed in a production object literal, which clones its
	// fields in GSE. Its callbacks still capture the original singleton manager.
	const manager = #include('../default/ui/parts/mainmenu/manager')('popup', popup);
	manager.data_stack = [];
	const result = {};
	result.view = view;
	result.popup = popup;
	result.manager = manager;
	result.state = state;
	result.m = m;
	return result;
};

return { events: events, display: display, game_popup: game_popup, menu_popup: menu_popup };
