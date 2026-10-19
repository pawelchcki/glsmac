// Public citizen-job observations cover the starting Worker/Doctor choices
// and one Doctor's +2 Psych. Other citizen outputs remain unmodeled here.
const for_job = (job_id) => {
	return { economy: 0, labs: 0, psych: job_id == 'DOCTOR' ? 2 : 0 };
};

return {
	for_job: for_job,
	get: (base) => {
		// Adding each current citizen's supported contribution is GLSMAC's
		// aggregation policy, separate from the size-one original witness.
		const result = { economy: 0, labs: 0, psych: 0 };
		for (pop of base.get_pops()) {
			const output = for_job(pop.get_type());
			result.economy = result.economy + output.economy;
			result.labs = result.labs + output.labs;
			result.psych = result.psych + output.psych;
		}
		return result;
	},
};
