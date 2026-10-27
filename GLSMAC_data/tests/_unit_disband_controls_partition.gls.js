// Each selected case owns a fresh native/UI fixture. Packetization changes no
// case body, input, assertion or cleanup and never splits a live case/world.
const scenarios = #include('./_unit_disband_regression_cases');
return (behavior,begin,end) => {
 if (#typeof(begin) != 'Int' || #typeof(end) != 'Int') { throw Error('Disband packet bounds must be integers'); }
 if (begin < 0 || end > 7 || begin >= end || #sizeof(scenarios) < 7) { throw Error('Disband packet must select original control cases'); }
 const cases = [];
 for (let index = begin; index < end; index++) {
  // Indexed append retains ArrayRef; materialize the original entry first.
  const entry = scenarios[index]; cases :+ entry;
 }
 behavior.group_staged(cases);
};
