// Installed TERRAIN/menu declarations and player manual pp46–52. Context F/R
// tries only actual eligible actions; a shortcut never waives core validation.
// Ambiguous punctuation remains menu-accessible and is not guessed here.
return {
 candidates: (e) => {
  if (e.modifiers == {}) {
   if (e.code == 'F') { return ['remove_fungus', 'soil_enricher', 'farm']; }
   if (e.code == 'R') { return ['mag_tube', 'road']; }
   if (e.code == 'M') { return ['mine']; }
   if (e.code == 'S') { return ['solar']; }
   if (e.code == 'K') { return ['bunker']; }
   if (e.code == 'O') { return ['sensor']; }
   if (e.code == 'N') { return ['condenser']; }
   if (e.code == 'Q') { return ['aquifer']; }
  }
  if (e.modifiers == {shift: true}) {
   if (e.code == 'F') { return ['forest']; }
   if (e.code == 'E') { return ['mirror']; }
   if (e.code == 'B') { return ['borehole']; }
   if (e.code == 'A') { return ['auto_former']; }
  }
  if (e.modifiers == {ctrl: true}) {
   if (e.code == 'F') { return ['plant_fungus']; }
   if (e.code == 'R') { return ['road_to']; }
   if (e.code == 'T') { return ['tube_to']; }
  }
  if (e.modifiers == {ctrl: true, shift: true}) {
   if (e.code == 'S') { return ['farm_solar_road']; }
   if (e.code == 'M') { return ['farm_mine_road']; }
   if (e.code == 'R') { return ['auto_roads']; }
   if (e.code == 'T') { return ['auto_tubes']; }
   if (e.code == 'O') { return ['auto_sensors']; }
   if (e.code == 'F') { return ['auto_remove_fungus']; }
   if (e.code == 'A') { return ['auto_home_base']; }
  }
  return [];
 },
};
