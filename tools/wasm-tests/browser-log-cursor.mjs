import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

// Offsets are JavaScript UTF-16 code units, never UTF-8 byte offsets. This
// function runs in the browser; only the fresh suffix crosses Playwright.
export function readBrowserLogDelta({offset}) {
  const started=performance.now();
  const element=document.querySelector('#log');
  if(!element)throw Error('Browser log element is missing');
  const text=element.textContent;
  let state=globalThis.__terraformLogCursorV1;
  if(!state){
    if(offset!==0)throw Error('Browser log cursor reset');
    state=globalThis.__terraformLogCursorV1={element,text:''};
  }
  if(state.element!==element)throw Error('Browser log element replaced');
  if(offset!==state.text.length)throw Error('Browser log cursor offset mismatch');
  if(!text.startsWith(state.text))throw Error('Browser log rewritten or truncated');
  const packet={start:offset,end:text.length,text:text.slice(offset),browser_read_ms:performance.now()-started};
  state.text=text;
  return packet;
}

export class BrowserLogCursor {
  constructor(page,onPacket=()=>{}){this.page=page;this.onPacket=onPacket;this.text='';this.reads=[];this.queue=Promise.resolve();this.failure=null;this.phase='open';this.finalQueued=false;this.sealed=null;}
  read(){
    if(this.phase!=='open')return Promise.reject(Error('Browser log cursor is closing or sealed'));
    return this.#enqueue();
  }
  beginClose(){
    assert.equal(this.phase,'open','Cursor closing starts exactly once');this.phase='closing';
  }
  finalRead(){
    assert.equal(this.phase,'closing');assert.equal(this.finalQueued,false,'Final suffix read queues once');this.finalQueued=true;
    return this.#enqueue();
  }
  async seal(){
    assert.equal(this.phase,'closing');
    this.phase='sealing';
    // The owner must close the producer/browser first, so its outstanding
    // evaluations settle. Accepted reads finish; no new body reads can enter.
    await this.queue;
    this.phase='sealed';
    this.sealed=Object.freeze({text:this.text,reads:Object.freeze(this.reads.map(row=>Object.freeze({...row}))),failure:this.failure?String(this.failure):null});
    return this.sealed;
  }
  #enqueue(){
    const operation=this.queue.then(async()=>{
      if(this.failure)throw this.failure;
      const started=performance.now();
      try{
        const packet=await this.page.evaluate(readBrowserLogDelta,{offset:this.text.length});
        assert.equal(packet.start,this.text.length,'Fresh log starts at the retained UTF-16 offset');
        assert.equal(typeof packet.text,'string');
        assert.equal(packet.end,packet.start+packet.text.length,'Fresh log end matches its UTF-16 length');
        this.text+=packet.text;
        this.onPacket(packet);
        this.reads.push({start_utf16:packet.start,end_utf16:packet.end,transferred_utf16:packet.text.length,
          transferred_utf8:Buffer.byteLength(packet.text,'utf8'),browser_read_ms:packet.browser_read_ms,
          round_trip_ms:performance.now()-started});
        return packet;
      }catch(error){this.failure=error;throw error;}
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
}
