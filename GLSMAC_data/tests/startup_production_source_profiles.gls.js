// Application controls use compact worlds; original replay keeps explicit 40x80.
const behavior = #include('./_behavior');
#include('./_startup_production_profiles')(behavior, [
	['GAIANS', 'CITIZEN', 'gaian-formers-cost-4', 'FORMERS', 32, 17],
	['GAIANS', 'CITIZEN', 'gaian-formers-cost-8', 'FORMERS', 64, 33],
	['GAIANS', 'CITIZEN', 'gaian-mineral-rule-12', 'FORMERS', 18, 10],
	['GAIANS', 'CITIZEN', 'gaian-industry-minus-1', 'FORMERS', 18, 9],
]);
