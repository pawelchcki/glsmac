// Exact bounded group of native mounted Colony founding scenarios.
const behavior = #include('./_behavior');
const scenarios = #include('./_colony_found_menu_regression_cases');
for (let index = 0; index < 8; index++) { const entry = scenarios[index]; behavior.scenario(entry.name, entry.run); }
