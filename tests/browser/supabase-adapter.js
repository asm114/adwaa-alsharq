(()=>{
'use strict';
window.__portalSyncToday='2026-10-15';
window.__qaErrors=[];
window.addEventListener('error',e=>window.__qaErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));
const user={id:'00000000-0000-4000-8000-000000000001',email:'admin@isolated.test'};
const session={user,access_token:'synthetic-test-token',refresh_token:'synthetic-refresh'};
function query(table){
 const spec={table,op:'select',filters:[],payload:null,single:false};
 const q=new Proxy({},{get(_,key){
   if(key==='then')return(resolve,reject)=>window.__qaQuery(structuredClone(spec)).then(resolve,reject);
   return(...args)=>{
     if(['insert','update','upsert','delete'].includes(key)){spec.op=key;spec.payload=args[0]??null}
     if(key==='eq')spec.filters.push([args[0],args[1]]);
     if(key==='select')spec.columns=args[0];
     if(['single','maybeSingle'].includes(key))spec.single=true;
     return q;
   };
 }});
 return q;
}
const channel={on(){return this},subscribe(){return this},unsubscribe(){}};
window.supabase={createClient:()=>({
 auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user},error:null}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({data:{session,user},error:null}),
 setSession:async()=>({data:{session},error:null}),signOut:async()=>({error:null})},
 from:query,rpc:async name=>({data:name==='is_resort_admin'?true:null,error:null}),channel:()=>channel,removeChannel(){},
 storage:{from:()=>({list:async()=>({data:[],error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})}
})};
window.fetch=async(...args)=>{throw new Error('Blocked fetch in isolated browser test: '+String(args[0]))};
})();
