const defs = #include('units/defs');
const turns = #include('units/turns');
const animations = #include('units/animations');

const result = {

	configure: (game) => {
		turns.configure(game);
	},

	define: (game, rules) => {
		defs.define(game, rules);
		animations.define(game);
	},

};

return result;
