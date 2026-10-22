// Strict red application probes until the production bindings are implemented.
// An underscore keeps these outside the default passing suite. The headless
// worker supplies its non-underscore alias when this file is selected explicitly.
const behavior = #include('./_behavior');
const scenarios = #include('./_terraform_menu_regression_cases');
for (scenario of scenarios) { behavior.scenario(scenario.name, scenario.run); }
