// STARVE wording comes from the common installed script; labels are indexed
// installed inputs. No population or continuation policy belongs to this parser.
const plain = (text) => {
 if (#typeof(text) != 'String' || #trim(text) == '') { throw Error('Empty starvation dialog text'); }
 for (marker of ['^', '|', '$', '{', '}']) {
  const parts = #split(text, marker);
  if (#sizeof(parts) != 1 || parts[0] != text) { throw Error('Unsupported starvation dialog formatting'); }
 }
 return text;
};
const format = (text, name) => {
 const words = #split(text, ' '); let result = ''; let index = 0;
 for (word of words) {
  if (index > 0) { result += ' '; }
  if (word == '$BASENAME0!') { result += name + '!'; }
  else if (word == '$BASENAME0') { result += name; }
  else { if (word != '') { plain(word); } result += word; }
  index++;
 }
 if (#trim(result) == '') { throw Error('Empty starvation dialog body'); }
 return result;
};
return {
 load: (glsmac, name) => {
  plain(name); let caption = null; const lines = [];
  for (record of glsmac.load_smac_text('script.txt', 'dialogs').dialog('STARVE').records) {
   switch (record.kind) {
    case 'blank': { break; }
    case 'comment': { break; }
    case 'directive': {
     if (record.name == 'caption') {
      if (caption != null) { throw Error('Duplicate STARVE caption'); } caption = plain(record.argument);
     } else if (record.name != 'xs' && record.name != 'wave') { throw Error('Unsupported STARVE directive'); }
     break;
    }
    case 'text': { lines :+ format(record.text, name); break; }
    default: { throw Error('Unsupported STARVE record'); }
   }
  }
  if (caption == null || #sizeof(lines) == 0) { throw Error('Incomplete STARVE dialog'); }
  const rows = [];
  for (record of glsmac.load_smac_text('labels.txt', 'dialogs').dialog('LABELS').records) {
   if (record.kind == 'text') { rows :+ record.text; }
   else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported starvation label record'); }
  }
  if (#sizeof(rows) < 445) { throw Error('Incomplete starvation labels'); }
  const text = #trim(rows[0]); const count = #to_int(text);
  if (#to_string(count) != text || count != #sizeof(rows) - 1) { throw Error('Invalid starvation label count'); }
  return {caption: caption, lines: lines, choices: [plain(rows[45]), plain(rows[46])], buttons: [plain(rows[444]), 'OK']};
 },
};
