// Initial allocation already used by the observed base HUD. Allocation editing
// and broader faction/policy rules remain separate work. Keep this calculation
// shared so future turn science uses the same values as the displayed report.
const specialists = #include('base_specialist_bonus');
return {
	get: (base, total_energy) => {
		const allocation_labs = 0.5; const allocation_psych = 0.0;
		const bonuses = specialists.get(base);
		const result = {
			labs: {allocation: allocation_labs, value: #round(#to_float(total_energy) * allocation_labs), bonus: bonuses.labs},
			psych: {allocation: allocation_psych, value: #round(#to_float(total_energy) * allocation_psych), bonus: bonuses.psych},
		};
		result.economy = {
			allocation: 1.0 - result.labs.allocation - result.psych.allocation,
			value: total_energy - result.labs.value - result.psych.value, bonus: bonuses.economy,
		};
		return result;
	},
};
