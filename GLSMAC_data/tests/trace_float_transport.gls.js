const behavior = #include('./_behavior');
const encode = #include('./_trace_json');
behavior.scenario('finite Float transport preserves its raw native binary32 value through JSON', () => {
 const samples = [0.0, #to_float('-0'), 1.0, 1.0 / 3.0, 0.1,
  #to_float('0.00000000000000000001'), #to_float('100000000000000000000.0'), (0.0 - 1.0) / 3.0];
 for (value of samples) {
  const text = #float_text_exact(value); const bits = #float_bits(value);
  test.assert(#float_bits(#to_float(text)) == bits, 'Exact wire text round trips native bits, including signed zero');
  #print('FLOAT_CODEC|' + text + '|' + #to_string(bits));
 }
 test.assert(#float_text_exact(1.0) == '1.0' && #float_text_exact(#to_float('-0')) == '-0.0');
 const pieces = #split('\\x', 'x'); const slash = pieces[0] + '';
 test.assert(encode(slash) == '"' + slash + slash + '"');
 test.assert(encode('"') == '"' + slash + '""');
 test.assert(encode('\n') == '"' + slash + 'n"');
 test.assert(encode('\t') == '"' + slash + 't"');
 #print('TRACE_CODEC_JSON|' + encode({text: 'Gaia\'s "Landing"\\road\nline\ttab', value: 1.0 / 3.0, signed_zero: #to_float('-0'), integer: 1, boolean: true, empty: null}));
});
behavior.scenario('nonfinite and non-Float exact text requests fail explicitly', () => {
 for (value of [1, '0.1', #to_float('nan'), #to_float('inf'), #to_float('-inf')]) {
  let rejected = false; try { #float_text_exact(value); } catch { : (error) => { rejected = true; } }
  test.assert(rejected);
 }
 for (value of [undefined, () => {}]) {
  let rejected = false; try { encode(value); } catch { : (error) => { rejected = true; } }
  test.assert(rejected);
 }
});
behavior.scenario('native exact JSON preserves control bytes UTF8 and integer bounds while rejecting invalid data', () => {
 const inputs = test.json_codec_inputs();
 #print('JSON_NATIVE_CODEC_V2|' + encode({controls: inputs.controls, unicode: inputs.unicode, empty: '',
  maximum: 9223372036854775807, minimum: (0 - 9223372036854775807 - 1), nested: [true, null, 1.0 / 3.0]}));
 for (value of inputs.invalid_utf8) {
  let rejected = false; try { encode(value); } catch { : (error) => { rejected = true; } }
  test.assert(rejected, 'Malformed UTF8 cannot become a JSON string');
 }
 for (value of inputs.nonfinite) {
  let rejected = false; try { encode(value); } catch { : (error) => { rejected = true; } }
  test.assert(rejected, 'Nonfinite numbers cannot become JSON numbers');
 }
 let rejected = false; try { encode(inputs.cyclic); } catch { : (error) => { rejected = true; } }
 test.assert(rejected, 'A cyclic object cannot be serialized');
 rejected = false; try { encode(test.input_state('')); } catch { : (error) => { rejected = true; } }
 test.assert(rejected, 'Native input wrappers/functions cannot be serialized');
});
