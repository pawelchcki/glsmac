// Fully synthetic dialog text; no original asset block or expected output.
let script = '#TECHNOLOGY\n#caption Synthetic Research\n#button Inspect\n#button Search\n' +
	'#TECHRANDOM\n#caption Synthetic Priorities\nFirst explanation.\nSecond explanation.\nThird explanation.\n\nArea A\nArea B\nArea C\nArea D\n' +
	'#RULES\n#caption Synthetic Game Rules\n#button Restore Standard\n#itemlist\n';
for (let index = 0; index < 18; index++) { script += (index == 9 ? 'Synthetic Blind Study' : 'Opaque option ' + #to_string(index)) + '\n'; }
script += '#END\n';
let labels = '#LABELS\n1131\n';
for (let ordinal = 0; ordinal < 1131; ordinal++) { labels += (ordinal == 101 ? 'Accept' : (ordinal == 102 ? 'Never mind' : 'Synthetic label ' + #to_string(ordinal))) + '\n'; }
labels += '#END\n';
return {script: script, labels: labels};
