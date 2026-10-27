// Offline real-capture integrity proof; this does not execute a candidate.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {BrowserLogCursor,readBrowserLogDelta} from './browser-log-cursor.mjs';
import {TerraformGeometry} from './terraform-browser-geometry.mjs';

const [rawPath,currentReportPath,outputPath]=process.argv.slice(2);
assert.ok(rawPath&&currentReportPath&&outputPath,'Requires actual raw log, later typed report and output paths');
const digest=value=>createHash('sha256').update(value).digest('hex');
const raw=readFileSync(rawPath),text=raw.toString('utf8');
assert.deepEqual(Buffer.from(text,'utf8'),raw,'Actual raw capture is valid lossless UTF-8');
const element={textContent:''};const context=vm.createContext({document:{querySelector:()=>element},performance});
const getter=vm.runInContext(`(${readBrowserLogDelta.toString()})`,context);
const chunks=[],cursor=new BrowserLogCursor({evaluate:async(fn,args)=>getter(args)},p=>chunks.push(JSON.stringify(p)));
const pattern=[1,8191,65537,3,131071];let offset=0,i=0;
while(offset<text.length){const end=Math.min(text.length,offset+pattern[i++%pattern.length]);element.textContent=text.slice(0,end);await Promise.all([cursor.read(),cursor.read()]);offset=end;}
assert.equal(cursor.text,text);assert.deepEqual(Buffer.from(cursor.text),raw);
assert.equal(cursor.reads.reduce((n,p)=>n+p.transferred_utf16,0),text.length);
const artifactText=chunks.map(line=>JSON.parse(line).text).join('');assert.equal(artifactText,text);
const packets=source=>source.split('\n').flatMap(line=>{const found=line.match(/^\s*(?:\[[^\]]+\]\s*)?(TF_INPUT|TF_DIAGNOSTIC_TRACE)\|(.+)$/);return found?[JSON.parse(JSON.parse(found[2]))]:[];});
const before=packets(text),after=packets(artifactText);assert.deepEqual(after,before);
const geometry=new TerraformGeometry();for(const packet of after)geometry.ingest(packet);
const reportBytes=readFileSync(currentReportPath),current=JSON.parse(reportBytes);
const events=current.input_ledger.events;const typedRestored=JSON.parse(JSON.stringify(events));assert.deepEqual(typedRestored,events);
const output={version:1,candidate_executed:false,scope:'offline cursor byte/offset/native-packet integrity',
 raw_capture:{path:rawPath,bytes:raw.length,utf16_code_units:text.length,sha256:digest(raw),restored_sha256:digest(Buffer.from(artifactText)),packets:after.length,native_events:after.reduce((n,p)=>n+p.events.length,0),native_geometry_last_sequence:geometry.sequence,exact_bytes:true,exact_packets:true},
 cursor:{reads:cursor.reads.length,transferred_utf16:cursor.reads.reduce((n,p)=>n+p.transferred_utf16,0),maximum_suffix_utf16:Math.max(...cursor.reads.map(p=>p.transferred_utf16)),serialized_concurrent_reads:true},
 later_typed_capture:{path:currentReportPath,report_sha256:digest(reportBytes),native_events:events.length,exact_typed_event_replay:true,original_raw_text_available:false,reconstructed_raw_claim:false},
 missing:'The final11.8MB timeout DOM log was not saved; no reconstructed original formatting claimed.',browser_passing_cases:0};
writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
