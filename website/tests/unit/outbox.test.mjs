import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DurableOutbox} from '../../src/lib/outbox-core.ts';
function store(){const data=new Map();return {getItemSync:key=>data.get(key)||null,setItemSync:(key,value)=>{data.set(key,value);},removeItemSync:key=>data.delete(key),getAllKeysSync:()=>[...data.keys()]};}
const message={clientId:'durable-id',conversationId:'conversation',userId:'buyer',body:'Please keep this message',createdAt:'2026-11-12T00:00:00Z',status:'pending'};
test('a restart and lost acknowledgement reuse the original message identifier',async()=>{
 const disk=store();let calls=0;const committed=new Map();
 const send=async m=>{calls++;committed.set(m.clientId,m.body);if(calls===1)throw new Error('Response lost after commit');};
 const first=new DurableOutbox(disk,send);first.activate('buyer');first.enqueue(message);await first.flush();assert.equal(first.list('buyer').length,1);
 const restarted=new DurableOutbox(disk,send);restarted.activate('buyer');await restarted.flush();assert.equal(restarted.list('buyer').length,0);assert.equal(committed.size,1);assert.equal(calls,2);
});
test('account isolation, terminal failures and deliberate retry',async()=>{
 const disk=store();let calls=0;let fail=true;const queue=new DurableOutbox(disk,async()=>{calls++;if(fail)throw {status:403};});
 queue.activate('buyer');queue.enqueue(message);queue.activate('other');await queue.flush();assert.equal(calls,0);assert.equal(queue.list('other').length,0);
 queue.activate('buyer');await queue.flush();assert.equal(queue.list('buyer')[0].status,'failed');await queue.flush();assert.equal(calls,1);
 fail=false;await queue.retry(queue.list('buyer')[0]);assert.equal(queue.list('buyer').length,0);
});
test('simultaneous flushes send a pending message once',async()=>{
 const disk=store();let calls=0;const queue=new DurableOutbox(disk,async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));});queue.activate('buyer');queue.enqueue(message);await Promise.all([queue.flush(),queue.flush()]);assert.equal(calls,1);
});
