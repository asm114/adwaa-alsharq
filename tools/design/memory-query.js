// This file is injected into the preview adapter only; never used by index.html.
const previewTables=new Map();
function query(table){
 let payload=null,operation='select',single=false;const filters=[];
 const result=async()=>{
  if(QA.delay)await new Promise(resolve=>setTimeout(resolve,QA.delay));
  if(operation!=='select'&&QA.fail)return{data:null,error:{message:'انقطاع تجريبي للاتصال'}};
  let rows=table==='app_state'?[{id:'main',data:structuredClone(saved),updated_at:new Date().toISOString()}]:(previewTables.get(table)||[]);
  const matches=row=>filters.every(([key,value])=>String(row[key])===String(value));
  if(operation!=='select'){
   QA.writes++;
   if(table==='app_state'&&payload?.data){saved=structuredClone(payload.data);rows=[{id:'main',data:structuredClone(saved),updated_at:new Date().toISOString()}]}
   else if(operation==='insert'||operation==='upsert'){const incoming=(Array.isArray(payload)?payload:[payload]).map(row=>({id:crypto.randomUUID(),...row}));rows=[...rows,...incoming];previewTables.set(table,rows);return{data:single?incoming[0]:incoming,error:null}}
   else if(operation==='update'){rows=rows.map(row=>matches(row)?{...row,...payload}:row);previewTables.set(table,rows)}
   else if(operation==='delete'){rows=rows.filter(row=>!matches(row));previewTables.set(table,rows);return{data:[],error:null}}
  }
  rows=rows.filter(matches);return{data:single?rows[0]||null:rows,error:null,count:rows.length};
 };
 const q=new Proxy({},{get(_,key){if(key==='then')return(resolve,reject)=>result().then(resolve,reject);return(...args)=>{if(['update','insert','upsert','delete'].includes(key)){operation=key;payload=args[0]}if(key==='eq')filters.push(args);if(['single','maybeSingle'].includes(key))single=true;return q}}});return q;
}
