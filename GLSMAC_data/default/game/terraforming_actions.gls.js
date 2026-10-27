// Installed TERRAIN and menu.txt TERRAFORM source identities. This vocabulary
// supplies no effects, work policy or shortcut interpretation. Rules and native
// validation decide each land/sea variant's availability. Disable is structural;
// the user-authorized technology bypass does not turn editor-only into work.
const entries = [
 {id: 'farm', row: 0},
 {id: 'soil_enricher', row: 1},
 {id: 'mine', row: 2},
 {id: 'solar', row: 3},
 {id: 'forest', row: 4},
 {id: 'road', row: 5},
 {id: 'mag_tube', row: 6},
 {id: 'bunker', row: 7},
 {id: 'airbase', row: 8},
 {id: 'sensor', row: 9},
 {id: 'remove_fungus', row: 10},
 {id: 'plant_fungus', row: 11},
 {id: 'condenser', row: 12},
 {id: 'mirror', row: 13},
 {id: 'borehole', row: 14},
 {id: 'aquifer', row: 15},
 {id: 'raise', row: 16},
 {id: 'lower', row: 17},
 {id: 'level', row: 18},
 {id: 'monolith', row: 19, editor_only: true},
];
const automation = [
 {id: 'farm_solar_road', source_index: 0},
 {id: 'farm_mine_road', source_index: 1},
 {id: 'road_to', source_index: 2},
 {id: 'tube_to', source_index: 3},
 {id: 'auto_roads', source_index: 4},
 {id: 'auto_tubes', source_index: 5},
 {id: 'auto_sensors', source_index: 6},
 {id: 'auto_remove_fungus', source_index: 7},
 {id: 'auto_home_base', source_index: 8},
 {id: 'auto_former', source_index: 9},
];
return {entries: entries, automation: automation};
