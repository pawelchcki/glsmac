// Controlled source rate and actual native input roughness; no completion
// answer is written. The real event, work tick and native transaction execute.
return (rate,rockiness) => {
	const f = #include('./_former_work_fixture')('arid');
	f.game.get_settings().global.rules.set_terraforming_ignore_technologies(true);
	const document = test.parse_smac_text(#include('./_terraform_action_source'),'rules'); const rows = document.rows('TERRAIN');
	const level = rows[18]; level[4] = #to_string(rate);
	f.game.set('terraforming_rules', #include('../default/game/terraforming_rules').parse({rows:(block) => { return rows; }}));
	f.with_write(() => { f.game.get_tm().apply_terrain([{x:2,y:2,rockiness:rockiness}],[]); });
	return f;
};
