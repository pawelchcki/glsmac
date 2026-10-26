// Current installed label consumers. Source precedence beyond this mapping is
// unobserved; original numeric production rules remain a separate contract.
return (glsmac) => {
 const rows = [];
 for (record of glsmac.load_smac_text('labels.txt', 'dialogs').dialog('LABELS').records) {
  if (record.kind == 'text') { rows :+ record.text; }
  else if (record.kind != 'blank' && record.kind != 'comment') { throw Error('Unsupported Base Operations label record'); }
 }
 if (#sizeof(rows) < 747) { throw Error('Incomplete Base Operations labels'); }
 const declared = #trim(rows[0]); const count = #to_int(declared);
 if (#to_string(count) != declared || count != #sizeof(rows) - 1) { throw Error('Invalid Base Operations label count'); }
 const read = (index) => {
  const value = rows[index + 1];
  if (#typeof(value) != 'String' || #trim(value) == '') { throw Error('Empty Base Operations source label'); }
  let text = ''; for (part of #split(value, '&')) { text += part; }
  return #uppercase(#trim(text));
 };
 return {title: read(691), production: read(744), citizens: read(745), garrison: read(63), datalinks: read(539), close: read(665)};
};
