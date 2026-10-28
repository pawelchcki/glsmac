// Complete original seven-case corpus for direct native callers. The catalog
// runs the exact 3+2+2 independent packets through separate isolated workers;
// only their complete ordered seven-name / 47-assertion aggregate can pass.
const behavior = #include('./_behavior');
#include('./_unit_disband_controls_partition')(behavior,0,7);
