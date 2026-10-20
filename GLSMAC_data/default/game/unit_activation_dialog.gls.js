// PICKUNIT contributes installed wording. Unit identity and activation remain
// native game/UI responsibilities; source text never supplies a unit list.
return {
	parse: (document) => {
		let caption = null;
		for (record of document.dialog('PICKUNIT').records) {
			switch (record.kind) {
				case 'blank': { break; }
				case 'comment': { break; }
				case 'directive': {
					if (record.name == 'caption') {
						if (caption != null || #typeof(record.argument) != 'String' || #trim(record.argument) == '') { throw Error('Invalid PICKUNIT caption'); }
						caption = record.argument;
						for (marker of ['^', '|', '$', '{', '}']) {
							const parts = #split(caption, marker);
							if (#sizeof(parts) != 1 || parts[0] != caption) { throw Error('Unsupported PICKUNIT caption formatting'); }
						}
					} else if (record.name != 'xs' && record.name != 'x' && record.name != 'y' && record.name != 'wave') { throw Error('Unsupported PICKUNIT directive'); }
					break;
				}
				default: { throw Error('Unsupported PICKUNIT record'); }
			}
		}
		if (caption == null) { throw Error('Missing PICKUNIT caption'); }
		return {caption: caption};
	},
};
