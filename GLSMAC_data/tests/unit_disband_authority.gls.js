const behavior = #include('./_behavior'); const scenarios = #include('./_unit_disband_regression_cases');
for (let index = 7; index < 13; index++) { const entry = scenarios[index]; behavior.scenario(entry.name, entry.run); }
