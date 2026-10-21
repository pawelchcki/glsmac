// The observed Rename prompt uses common Script and installed label indices.
const plain = (value) => {
 if (#typeof(value) != 'String' || #trim(value) == '') { throw Error('Empty Rename source text'); }
 for (marker of ['^', '|', '$', '{', '}']) { if (#sizeof(#split(value, marker)) != 1) { throw Error('Unsupported Rename source formatting'); } }
 return value;
};
return {
 load: (glsmac, name) => {
  if (#typeof(name) != 'String') { throw Error('Rename needs a native city name'); }
  let caption = null; const lines = [];
  for (record of glsmac.load_smac_text('script.txt', 'dialogs').dialog('RENAME').records) {
   if (record.kind == 'text') { lines :+ record.text; }
   else if (record.kind == 'directive') {
    if (record.name == 'caption' && caption == null) { caption = plain(record.argument); }
    else if (record.name != 'xs') { throw Error('Unsupported or duplicate Rename directive'); }
   } else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported Rename source record'); }
  }
  if (caption == null || #sizeof(lines) != 2) { throw Error('Incomplete Rename source'); }
  let prompt = ''; let placeholders = 0; let index = 0;
  for (word of #split(lines[0], ' ')) {
   if (index > 0) { prompt += ' '; }
   if (word == '$BASENAME0?') { prompt += name + '?'; placeholders++; }
   else if (word == '$BASENAME0') { prompt += name; placeholders++; }
   else { if (word != '') { plain(word); } prompt += word; }
   index++;
  }
  if (placeholders != 1) { throw Error('Rename prompt needs one city placeholder'); }
  const rows = [];
  for (record of glsmac.load_smac_text('labels.txt', 'dialogs').dialog('LABELS').records) {
   if (record.kind == 'text') { rows :+ record.text; }
   else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported Rename label record'); }
  }
  if (#sizeof(rows) < 104) { throw Error('Incomplete Rename labels'); }
  const count_text = #trim(rows[0]); const count = #to_int(count_text);
  if (#to_string(count) != count_text || count != #sizeof(rows) - 1) { throw Error('Invalid Rename label count'); }
  return {caption: caption, prompt: prompt, label: plain(lines[1]), buttons: [plain(rows[102]), plain(rows[103])]};
 },
};
