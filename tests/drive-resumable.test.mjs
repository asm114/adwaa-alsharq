import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function uploadGoogleDriveChunk('),html.indexOf('async function uploadBackupRecordToGoogleDrive('));
function setup(mode='success'){
 const sent=[];
 class XHR{
  headers={};status=0;responseText='';
  open(method,url){assert.equal(method,'PUT');assert.ok(url.startsWith('https://www.googleapis.com/'));}
  setRequestHeader(key,value){this.headers[key]=value}
  getResponseHeader(){return mode==='no-range'?null:this.range}
  send(blob){
   sent.push(this.headers['Content-Range']);assert.equal(this.timeout,30000);
   queueMicrotask(()=>{
    if(mode==='timeout'){this.ontimeout();return}
    if(mode==='unauthorized'){this.status=401;this.onload();return}
    const [,start,end,total]=this.headers['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/).map(Number);
    assert.equal(Number(end)-Number(start)+1,blob.size);
    this.status=end===total-1?200:308;this.range=`bytes=0-${end}`;
    this.responseText=this.status===200?' {"id":"synthetic-drive-file"}':'';this.onload();
   });
  }
 }
 const context={Blob,URL,XMLHttpRequest:XHR,googleDriveAccessToken:'synthetic-token',googleDriveTokenExpiresAt:99999,GOOGLE_DRIVE_CHUNK_SIZE:4,setTimeout:(f)=>setTimeout(f,0),googleDriveFetch:async()=>({headers:new Headers({Location:'https://www.googleapis.com/upload/synthetic-session'})})};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,sent};
}
test('resumable upload advances only through server-confirmed ranges',async()=>{
 const {context,sent}=setup();const file=await context.resumableGoogleDriveUpload({json:'0123456789'},{id:'synthetic-drive-file'});
 assert.equal(file.id,'synthetic-drive-file');assert.deepEqual(sent,['bytes 0-3/10','bytes 4-7/10','bytes 8-9/10']);
});
test('missing resumable Range never assumes that bytes were accepted',async()=>{
 const {context,sent}=setup('no-range');await assert.rejects(context.resumableGoogleDriveUpload({json:'0123456789'},{}),/لم يؤكد Google/);assert.equal(sent.length,1);
});
test('resumable timeout rejects and retries only within the same session',async()=>{
 const {context,sent}=setup('timeout');await assert.rejects(context.resumableGoogleDriveUpload({json:'0123456789'},{}),/لم يتأكد رد/);assert.equal(sent.length,3);
});
test('resumable 401 clears the token without persisting credentials',async()=>{
 const {context}=setup('unauthorized');await assert.rejects(context.uploadGoogleDriveChunk('https://www.googleapis.com/upload/synthetic-session',new Blob(['0123']),0,10),/أعد الاتصال/);assert.equal(context.googleDriveAccessToken,'');assert.equal(context.googleDriveTokenExpiresAt,0);
});
