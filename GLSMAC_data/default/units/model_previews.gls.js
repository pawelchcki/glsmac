// Application preview of the independently observed stock Former component.
// Whole assembly, authored chassis/armor variants, facing/lighting/animation
// semantics and exact original camera/scale remain unsupported.
return (entry) => {
	if (entry.id != 'Formers' || !#is_defined(entry.source_components)) { return null; }
	const source = entry.source_components;
	if (source.prototype != 1 || source.chassis != 0 || source.armor != 0 || source.reactor != 0 ||
		entry.weapon_mode != 9 || entry.movement != 1 || entry.combat.kind != 'civilian' ||
		entry.combat.offense != 0 || entry.combat.defense != 1 || entry.combat.reactor != 1) { return null; }
	return {type: 'sprite', file: 'VT.cvr', x: 0, y: 0, w: 100, h: 75, cx: 50, cy: 60};
};
