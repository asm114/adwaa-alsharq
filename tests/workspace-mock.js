/* Synthetic QA adapter. Never included by the production index.html. */
(()=>{
const seed={bookings:[],expenses:[],maintenanceJobs:[],subscriptions:[],accountingNotes:[],notifications:[],customerNotes:{},customerCredits:[],resortAccount:{calibration:null,manualMovements:[]},settings:{commissionEnabled:true,commissionMethod:'per_day',commissionRate:100,resortStatus:'ready',calendarMode:'both'},seq:1};
let saved=structuredClone(seed);
window.QA={writes:0,fail:false,delay:0,errors:[]};
window.addEventListener('error',e=>QA.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>QA.errors.push(String(e.reason)));
const user={id:'00000000-0000-4000-8000-000000000001',email:'asm114@hotmail.com'};
function query(table){
 let payload=null,single=false;
 const result=async()=>{if(QA.delay)await new Promise(r=>setTimeout(r,QA.delay));if(payload){QA.writes++;if(QA.fail)return{data:null,error:{message:'انقطاع تجريبي للاتصال'}};if(table==='app_state'&&payload.data)saved=structuredClone(payload.data)}return{data:table==='app_state'?{id:'main',data:structuredClone(saved),updated_at:new Date().toISOString()}:single?null:[],error:null,count:0}};
 const q=new Proxy({},{get(_,key){if(key==='then')return(resolve,reject)=>result().then(resolve,reject);return(...args)=>{if(['update','insert','upsert'].includes(key))payload=args[0];if(['single','maybeSingle'].includes(key))single=true;return q}}});return q;
}
const channel={on(){return this},subscribe(){return this},unsubscribe(){}};
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user,access_token:'synthetic'}},error:null}),getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},from:query,rpc:async()=>({data:[],error:null}),channel:()=>channel,removeChannel(){},storage:{from:()=>({list:async()=>({data:[],error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})}})};
window.fetch=async()=>{throw new Error('External network disabled in isolated QA')};
if(navigator.serviceWorker)navigator.serviceWorker.register=async()=>({});
})();
