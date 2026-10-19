// Native display boundary for menu contracts. Decoration, fonts, geometry,
// textures and audio allocate no scene objects. Interactive buttons, owned
// timers and event callbacks remain observable; production scripts own them.
return () => {
	const view = { nodes: [], timers: [] };
	const events = (node) => {
		node.handlers = [];
		node.on = (name, callback) => { node.handlers :+ { name: name, callback: callback }; };
		node.emit = (name, data) => {
			let result = false;
			for (handler of node.handlers) {
				if (handler.name == name) { result = handler.callback(data); }
			}
			return result;
		};
	};
	const create = (kind, properties) => {
		const node = { kind: kind, removed: false, children: [], owned_timers: [], right: 0 };
		for (key in properties) { node[key] = properties[key]; }
		events(node);
		node.addclass = (name) => { node.class = name; };
		node.removeclass = (name) => { node.class = ''; };
		node.remove = () => {
			node.removed = true;
			node.handlers = [];
			for (child of node.children) { child.remove(); }
			for (timer of node.owned_timers) { timer.stop(); }
		};
		node.timer = (interval, callback) => {
			const timer = { running: true };
			timer.stop = () => { timer.running = false; };
			timer.tick = () => {
				if (!timer.running) { return false; }
				timer.running = callback() == true;
				return timer.running;
			};
			node.owned_timers :+ timer;
			view.timers :+ timer;
			return timer;
		};
		node.button = (props) => {
			const button = create('button', props);
			node.children :+ button;
			return button;
		};
		node.area = (props) => {
			const area = create('area', props);
			node.children :+ area;
			return area;
		};
		node.window = (props) => {
			const window = create('window', props);
			node.children :+ window;
			return window;
		};
		node.input = (props) => {
			const field = create('input', props);
			node.children :+ field;
			return field;
		};
		// Panels only group decorative drawing in these bounded menu scripts.
		node.panel = (props) => { return node; };
		node.surface = (props) => {};
		node.sound = (props) => {};
		if (!#is_defined(node.text)) { node.text = (props) => { return { text: props.text }; }; }
		view.nodes :+ node;
		return node;
	};
	view.root = create('root', {});
	const style = {};
	style.set = (props) => { return style; };
	style.extend = (parent) => { return style; };
	view.ui = { class: (name) => { return style; } };
	view.live = (kind) => {
		const nodes = [];
		for (node of view.nodes) {
			if (!node.removed && node.kind == kind) { nodes :+ node; }
		}
		return nodes;
	};
	view.find = (kind, key, value) => {
		for (node of view.nodes) {
			if (!node.removed && node.kind == kind && node[key] == value) { return node; }
		}
		throw Error('Native display target missing');
	};
	view.running_timers = () => {
		let count = 0;
		for (timer of view.timers) { if (timer.running) { count++; } }
		return count;
	};
	return view;
};
