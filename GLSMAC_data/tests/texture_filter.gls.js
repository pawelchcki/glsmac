const behavior = #include('./_behavior');
// A non-square, asymmetric RGBA fixture, including transparent/translucent pixels.
const pixels = [];
for (let index = 1; index <= 12; index++) { pixels :+ index + 16 * 256 + 64 * 65536 + (index % 3 == 0 ? 0 : (index % 3 == 1 ? 128 : 255)) * 16777216; }
const check = (steps, width, height, indices) => {
	const result = test.texture_filter(4, 3, pixels, steps); const expected = [];
	for (index of indices) { expected :+ pixels[index - 1]; }
	test.assert(result.width == width && result.height == height);
	test.assert(result.pixels == expected);
	test.assert(result.source == pixels);
};
behavior.scenario('First crop selects inclusive offset rows and preserves source RGBA and alpha', () => {
	check([['crop',1,1,3,2]],3,2,[6,7,8,10,11,12]);
	check([['crop',3,2,3,2]],1,1,[12]);
	check([['crop',0,0,3,2]],4,3,[1,2,3,4,5,6,7,8,9,10,11,12]);
});
behavior.scenario('Repeated crop uses the existing cropped color map and its new row stride', () => {
	check([['crop',1,0,3,2],['crop',0,1,1,2]],2,2,[6,7,10,11]);
});
behavior.scenario('Crop before or after identity tint and contrast preserves actual native color conversion', () => {
	for (steps of [[['tint',0],['crop',1,1,3,2]],[['crop',1,1,3,2],['tint',0]],[['contrast',100],['crop',1,1,3,2]],[['crop',1,1,3,2],['contrast',100]]]) {
		check(steps,3,2,[6,7,8,10,11,12]);
	}
	const before = test.texture_filter(4,3,pixels,[['tint',100],['crop',1,1,3,2]]);
	const after = test.texture_filter(4,3,pixels,[['crop',1,1,3,2],['tint',100]]);
	const red = 255 + 255 * 16777216;
	test.assert(before.pixels == [red,red,red,red,red,red]);
	test.assert(after.pixels == before.pixels);
});
behavior.scenario('Crop composes with actual native rotation and both flips without altering source', () => {
	check([['rotate'],['crop',0,1,1,2]],2,2,[2,6,3,7]);
	check([['crop',1,0,3,1],['rotate']],2,3,[2,6,3,7,4,8]);
	check([['crop',1,0,3,1],['flipv']],3,2,[6,7,8,2,3,4]);
	check([['crop',1,0,3,1],['fliph']],3,2,[4,3,2,8,7,6]);
});
behavior.scenario('Nonidentity contrast preserves asymmetric channels and alpha across offset crop', () => {
	const before = test.texture_filter(4,3,pixels,[['contrast',200],['crop',1,1,3,2]]);
	const after = test.texture_filter(4,3,pixels,[['crop',1,1,3,2],['contrast',200]]);
	const expected = [];
	for (index of [6,7,8,10,11,12]) { expected :+ index * 2 + 32 * 256 + 128 * 65536 + (index % 3 == 0 ? 0 : (index % 3 == 1 ? 128 : 255)) * 16777216; }
	test.assert(before.pixels == expected);
	test.assert(after.pixels == expected);
	test.assert(before.source == pixels);
	test.assert(after.source == pixels);
});
