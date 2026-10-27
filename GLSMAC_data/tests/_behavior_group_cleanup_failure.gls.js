// Explicit expected-negative execution; never a passing regression suite.
const behavior = #include('./_behavior');
#include('./_behavior_group_failure_fixture')(behavior,'cleanup');
