// Same real controls, native guards and clean shutdown as base opening.
process.env.BASE_OPEN_CONTRACT = 'hud';
await import('./base-open.test.mjs');
