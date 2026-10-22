// Native application regressions for the four production Terraform bindings.
// These authority/lifecycle checks are separate from original pointer traces.
const behavior = #include('./_behavior');
const scenarios = #include('./_terraform_menu_regression_cases');
for (scenario of scenarios) { behavior.scenario(scenario.name, scenario.run); }
