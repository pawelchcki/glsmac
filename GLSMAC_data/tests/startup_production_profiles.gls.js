// Application controls use compact worlds; original replay keeps explicit 40x80.
const behavior = #include('./_behavior');
#include('./_startup_production_profiles')(behavior, [
	['GAIANS', 'CITIZEN', 'stock', 'FORMERS', 16, 9],
	['HIVE', 'CITIZEN', 'stock', 'COLONY_POD', 24, 13],
	['GAIANS', 'TALENT', 'stock', 'FORMERS', 16, 9],
	['GAIANS', 'CITIZEN', 'gaian-physics', 'COLONY_POD', 24, 13],
]);
