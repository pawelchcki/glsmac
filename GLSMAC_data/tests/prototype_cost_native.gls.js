// Recorded ability-free row witnesses; actual native UM query and independent state.
const behavior = #include('./_behavior');
const f = test.founding_fixture();
const um = f.game.um;
const cost = (v) => { return um.get_prototype_base_cost(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7]); };
const reject = (callback) => {
 let rejected = false;
 try { callback(); } catch { : (e) => { rejected = true; } }
 test.assert(rejected, 'invalid component query must reject');
};
behavior.scenario('actual native unit manager exposes ability-free row query', () => {
 test.assert(#typeof(um.get_prototype_base_cost) == 'Callable');
});
behavior.scenario('recorded native cost witness prototype-0744', () => {
 const before = f.snapshot();
 test.assert(cost([3, 0, false, 0, 0, 3, 3, 1]) == 7);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-0747', () => {
 const before = f.snapshot();
 test.assert(cost([3, 0, false, 0, 0, 3, 3, 4]) == 6);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-0748', () => {
 const before = f.snapshot();
 test.assert(cost([3, 1, false, 0, 0, 3, 3, 1]) == 3);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-0751', () => {
 const before = f.snapshot();
 test.assert(cost([3, 1, false, 0, 0, 3, 3, 4]) == 6);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-0752', () => {
 const before = f.snapshot();
 test.assert(cost([3, 2, false, 0, 0, 3, 3, 1]) == 3);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-0755', () => {
 const before = f.snapshot();
 test.assert(cost([3, 2, false, 0, 0, 3, 3, 4]) == 6);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-1815', () => {
 const before = f.snapshot();
 test.assert(cost([1, 0, true, 99, 0, 1, 1, 1]) == 1);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-1839', () => {
 const before = f.snapshot();
 test.assert(cost([1, 1, true, 99, 0, 1, 1, 1]) == 1);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-1863', () => {
 const before = f.snapshot();
 test.assert(cost([1, 2, true, 99, 0, 1, 1, 1]) == 1);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('recorded native cost witness prototype-1526', () => {
 const before = f.snapshot();
 test.assert(cost([1, 1, false, 0, 11, 1, 1, 3]) == 5);
 test.assert(f.snapshot() == before, 'read-only cost query preserves world');
});
behavior.scenario('native cost rejects chassis-low', () => { reject(() => { cost([0, 0, false, 0, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects chassis-high', () => { reject(() => { cost([33, 0, false, 0, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects triad-low', () => { reject(() => { cost([1, (0 - 1), false, 0, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects triad-high', () => { reject(() => { cost([1, 3, false, 0, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects missile-type', () => { reject(() => { cost([1, 0, 1, 0, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects offense-low', () => { reject(() => { cost([1, 0, false, (0 - 2), 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects offense-high', () => { reject(() => { cost([1, 0, false, 128, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects mode-low', () => { reject(() => { cost([1, 0, false, 0, (0 - 1), 1, 1, 1]); }); });
behavior.scenario('native cost rejects mode-high', () => { reject(() => { cost([1, 0, false, 0, 15, 1, 1, 1]); }); });
behavior.scenario('native cost rejects weapon-low', () => { reject(() => { cost([1, 0, false, 0, 0, 0, 1, 1]); }); });
behavior.scenario('native cost rejects weapon-high', () => { reject(() => { cost([1, 0, false, 0, 0, 33, 1, 1]); }); });
behavior.scenario('native cost rejects armor-low', () => { reject(() => { cost([1, 0, false, 0, 0, 1, 0, 1]); }); });
behavior.scenario('native cost rejects armor-high', () => { reject(() => { cost([1, 0, false, 0, 0, 1, 33, 1]); }); });
behavior.scenario('native cost rejects reactor-low', () => { reject(() => { cost([1, 0, false, 0, 0, 1, 1, 0]); }); });
behavior.scenario('native cost rejects reactor-high', () => { reject(() => { cost([1, 0, false, 0, 0, 1, 1, 5]); }); });
behavior.scenario('native cost rejects integer-bool', () => { reject(() => { cost([true, 0, false, 0, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects integer-float', () => { reject(() => { cost([1.0, 0, false, 0, 0, 1, 1, 1]); }); });
behavior.scenario('native cost rejects missing or ability arguments', () => {
 reject(() => { um.get_prototype_base_cost(1, 0, false, 0, 0, 1, 1); });
 reject(() => { um.get_prototype_base_cost(1, 0, false, 0, 0, 1, 1, 1, 0); });
});
