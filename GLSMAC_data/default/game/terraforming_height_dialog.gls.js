// Wording comes from installed dialog blocks. Fee/reserves come only from a
// live authoritative quote; this consumer contains no pricing or height rule.
const plain = (text) => {
 if (#typeof(text) != 'String' || #trim(text) == '') { throw Error('Empty SMAC height dialog text'); }
 for (marker of ['^', '|', '$', '{', '}']) {
  const parts = #split(text, marker);
  if (#sizeof(parts) != 1 || parts[0] != text) { throw Error('Unsupported SMAC height dialog formatting'); }
 }
 return text;
};
const format = (text, fee, reserves) => {
 // Only these two emphasis spans are understood. Preserve raw source lines
 // in the definition; exact font/emphasis geometry is not claimed here.
 let result = ''; let index = 0;
 for (word of #split(text, ' ')) {
  if (index > 0) { result += ' '; }
  let rendered = null;
  for (pair of [['$NUM0', #to_string(fee)], ['$NUM1', #to_string(reserves)], ['{raise}', 'raise'], ['{lower}', 'lower']]) {
   for (suffix of ['', '.', ',', ';', ':', '!', '?']) {
    if (word == pair[0] + suffix) { rendered = pair[1] + suffix; }
   }
  }
  if (rendered == null) { if (word != '') { plain(word); } rendered = word; }
  result += rendered; index++;
 }
 return plain(result);
};
const block = (document, id, itemlist) => {
 const source = document.dialog(id); let caption = null; let list = false; const lines = [];
 for (record of source.records) {
  switch (record.kind) {
   case 'blank': { break; }
   case 'comment': { break; }
   case 'text': { lines :+ record.text; break; }
   case 'directive': {
    if (record.name == 'caption') {
     if (caption != null || itemlist) { throw Error('Unexpected/duplicate height caption'); }
     caption = plain(record.argument);
    } else if (record.name == 'itemlist') {
     if (!itemlist || list) { throw Error('Unexpected/duplicate height choice list'); } list = true;
    } else if (record.name != 'xs' && record.name != 'x' && record.name != 'y' && record.name != 'wave') {
     throw Error('Unsupported SMAC height directive');
    }
    break;
   }
   default: { throw Error('Unsupported SMAC height record'); }
  }
 }
 if ((itemlist && (!list || #sizeof(lines) != 2)) || (!itemlist && (caption == null || #sizeof(lines) < 1 || #sizeof(lines) > 3))) {
  throw Error('Incomplete SMAC height dialog');
 }
 for (line of lines) { format(line, 0, 0); }
 return {caption: caption, lines: lines};
};
return {
 parse: (document) => {
  const up = block(document, 'TERRACOSTUP', false); const down = block(document, 'TERRACOSTDOWN', false);
  const pay = block(document, 'TERRAPAY', true);
  return {raise: up, lower: down, choices: pay.lines};
 },
 render: (definition, action, fee, reserves) => {
  if ((action != 'raise' && action != 'lower') || #typeof(fee) != 'Int' || #typeof(reserves) != 'Int' || fee < 0 || reserves < 0) {
   throw Error('Height wording requires an actual nonnegative integer quote');
  }
  const source = definition[action]; const lines = []; const choices = [];
  for (line of source.lines) { lines :+ format(line, fee, reserves); }
  for (line of definition.choices) { choices :+ format(line, fee, reserves); }
  return {caption: source.caption, lines: lines, choices: choices,
   source_lines: #clone(source.lines), source_choices: #clone(definition.choices), fee: fee, reserves: reserves};
 },
};
