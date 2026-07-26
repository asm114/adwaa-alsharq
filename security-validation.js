(function(global){
  'use strict';

  const FORBIDDEN=new Set(['__proto__','constructor','prototype']);
  const LIMITS={text:5000,longText:50000,array:100000,photos:30,photoBytes:1000000};
  const DB_FIELDS=new Set(['bookings','expenses','cleaningTasks','notifications','customerNotes','backupHistory','auditLog','settings','seq']);
  const BOOKING_FIELDS=new Set([
    'id','code','name','phone','date','type','stayDays','total','paid','status','notes','recordType',
    'photos','commissionSnapshot','manualOperations','manualMessages','communicationActivity',
    'createdAt','updatedAt','confirmedAt','cancelledAt','cancelReason','enteredAt','exitedAt',
    'paymentMethod','paymentStatus','deposit','damageAmount','customerId','source','familyPresence',
    'checkoutAt','cleaningApprovedAt','cleaningStatus','commissionReceivedAt','commissionReceivedBeforeSystem',
    'commissionReceivedBy','totalPaid'
  ]);
  const EXPENSE_FIELDS=new Set(['id','ref','date','title','notes','cat','paymentMethod','externalRef','amount','createdAt','updatedAt','bookingId','commissionId','type']);
  const CLEANING_FIELDS=new Set([
    'id','bookingId','bookingCode','bookingName','phone','date','type','token','accessExpiresAt',
    'status','worker','notes','photos','checklist','createdAt','updatedAt','completedAt','approvedAt',
    'returnedAt','taskName','taskDescription','publicStatus','cancelledAt','bookingDate','customer',
    'checkoutAt','arrivedAt','startedAt','departedAt','handedOverAt','issues','returnReason','entry','exit'
  ]);
  const NOTIFICATION_FIELDS=new Set(['id','bookingId','taskId','type','title','message','read','at','createdAt','updatedAt']);
  const AUDIT_FIELDS=new Set(['id','at','user','action','entity','details','before','after']);
  const BACKUP_HISTORY_FIELDS=new Set(['id','recoveryId','createdAt','size','user','type','version','stored','fileName','location','providerId','verified','status','relationshipWarnings']);
  const SETTINGS_FIELDS=new Set(['waNumber','welcomeMsgDaily','welcomeMsgStay','resortStatus','resortStatusUpdated','calendarMode','commissionEnabled','commissionMethod','commissionRate','showHelp','retainOfflineData']);
  const PHOTO_FIELDS=new Set(['id','dataUrl','note','place','phase','createdAt','updatedAt']);
  const COMMISSION_FIELDS=new Set(['method','rate','days','bookingTotal','amount','earnedAt','received','receivedAt','status','cancelledAt','cancelReason']);
  const ALLOWED_BOOKING_STATUS=new Set(['غير مؤكد','مؤكد','تم الدخول','تم الخروج','ملغي']);
  const ALLOWED_BOOKING_TYPE=new Set(['يومي','مبيت','يوم الأهل']);

  function rejectForbidden(value,depth=0,state={nodes:0}){
    if(++state.nodes>LIMITS.array||depth>24)throw new Error('بنية البيانات تتجاوز الحد الآمن');
    if(!value||typeof value!=='object')return;
    for(const [key,item] of Object.entries(value)){
      if(FORBIDDEN.has(key))throw new Error('تحتوي البيانات مفتاحًا محظورًا');
      rejectForbidden(item,depth+1,state);
    }
  }
  function parseJson(text){
    const parsed=JSON.parse(String(text??''),(key,value)=>{
      if(FORBIDDEN.has(key))throw new Error('تحتوي البيانات مفتاحًا محظورًا');
      return value;
    });
    rejectForbidden(parsed);return parsed;
  }
  function text(value,max=LIMITS.text){return typeof value==='string'?value.slice(0,max):value==null?'':String(value).slice(0,max)}
  function finite(value,{min=-Number.MAX_SAFE_INTEGER,max=Number.MAX_SAFE_INTEGER,fallback=0}={}){
    const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:fallback;
  }
  function isoDate(value){
    const raw=text(value,32);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return '';
    const parsed=new Date(`${raw}T00:00:00Z`);return Number.isNaN(parsed.getTime())?'':raw;
  }
  function isoDateTime(value){
    const raw=text(value,64);return raw&&!Number.isNaN(new Date(raw).getTime())?raw:'';
  }
  function id(value){const raw=text(value,128);return /^[A-Za-z0-9_-]{1,128}$/.test(raw)?raw:''}
  function phone(value){const raw=text(value,24).replace(/[^\d+]/g,'');return /^\+?\d{8,15}$/.test(raw)?raw:''}
  function pick(raw,fields){
    const output=Object.create(null);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return output;
    for(const key of fields)if(Object.hasOwn(raw,key)&&!FORBIDDEN.has(key))output[key]=raw[key];
    return output;
  }
  function safeValue(value,depth=0,state={nodes:0}){
    if(++state.nodes>LIMITS.array||depth>12)throw new Error('قيمة متداخلة تتجاوز الحد الآمن');
    if(typeof value==='string')return text(value,LIMITS.longText);
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    if(typeof value==='boolean'||value==null)return value;
    if(Array.isArray(value))return value.slice(0,1000).map(item=>safeValue(item,depth+1,state));
    if(typeof value==='object'){
      const output=Object.create(null);
      for(const [key,item] of Object.entries(value)){
        if(FORBIDDEN.has(key)||/(?:password|passwd|secret|refresh|access[_-]?token|api[_-]?key|private[_-]?key)/i.test(key))continue;
        output[text(key,100)]=safeValue(item,depth+1,state);
      }
      return output;
    }
    return null;
  }
  function safePhoto(raw){
    const p=pick(raw,PHOTO_FIELDS),url=text(p.dataUrl,LIMITS.photoBytes);
    p.id=id(p.id);p.note=text(p.note,1000);p.place=text(p.place,100);p.phase=['before','after'].includes(p.phase)?p.phase:'before';
    p.dataUrl=/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(url)?url:'';
    p.createdAt=isoDateTime(p.createdAt);p.updatedAt=isoDateTime(p.updatedAt);return p;
  }
  function safeBooking(raw){
    const b=pick(raw,BOOKING_FIELDS);
    b.id=id(b.id);b.code=text(b.code,64);b.name=text(b.name,200);b.phone=phone(b.phone);b.date=isoDate(b.date);
    b.type=ALLOWED_BOOKING_TYPE.has(b.type)?b.type:'يومي';b.stayDays=finite(b.stayDays,{min:1,max:365,fallback:1});
    b.total=finite(b.total,{min:0,max:100000000});b.paid=finite(b.paid,{min:0,max:100000000});
    b.status=ALLOWED_BOOKING_STATUS.has(b.status)?b.status:'غير مؤكد';b.notes=text(b.notes,LIMITS.longText);
    b.recordType=['booking','customer','family'].includes(b.recordType)?b.recordType:'customer';
    b.photos=(Array.isArray(b.photos)?b.photos:[]).slice(0,LIMITS.photos).map(safePhoto).filter(photo=>photo.dataUrl);
    if(b.commissionSnapshot&&typeof b.commissionSnapshot==='object'){
      const c=pick(b.commissionSnapshot,COMMISSION_FIELDS);
      c.method=['per_booking','per_day','percentage'].includes(c.method)?c.method:'per_day';
      c.rate=finite(c.rate,{min:0,max:1000000});c.days=finite(c.days,{min:1,max:365,fallback:1});
      c.bookingTotal=finite(c.bookingTotal,{min:0,max:100000000});c.amount=finite(c.amount,{min:0,max:100000000});
      c.status=['not_earned','earned','received','cancelled','received_before_system','no_commission'].includes(c.status)?c.status:'not_earned';
      b.commissionSnapshot=c;
    }
    b.manualOperations=safeValue(b.manualOperations);
    b.manualMessages=safeValue(b.manualMessages);
    b.communicationActivity=safeValue(b.communicationActivity);
    return b;
  }
  function safeExpense(raw){
    const e=pick(raw,EXPENSE_FIELDS);e.id=id(e.id);e.ref=text(e.ref,64);e.date=isoDate(e.date);e.title=text(e.title,300);e.notes=text(e.notes,LIMITS.longText);
    e.cat=text(e.cat,100);e.paymentMethod=text(e.paymentMethod,100);e.externalRef=text(e.externalRef,200);e.amount=finite(e.amount,{min:0,max:100000000});return e;
  }
  function safeCleaning(raw){
    const t=pick(raw,CLEANING_FIELDS);t.id=id(t.id);t.bookingId=id(t.bookingId);t.bookingCode=text(t.bookingCode,64);t.bookingName=text(t.bookingName,200);t.phone=phone(t.phone);
    t.date=isoDate(t.date);t.type=ALLOWED_BOOKING_TYPE.has(t.type)?t.type:'يومي';t.token=/^[a-f0-9]{32}$/i.test(text(t.token,32))?String(t.token):'';
    t.status=['جديدة','قيد التنفيذ','مكتملة','بانتظار الاعتماد','معتمدة','إعادة تنظيف','ملغي','done','pending'].includes(t.status)?t.status:'جديدة';
    t.worker=text(t.worker,200);t.notes=text(t.notes,LIMITS.longText);t.photos=(Array.isArray(t.photos)?t.photos:[]).slice(0,LIMITS.photos).map(safePhoto).filter(photo=>photo.dataUrl);
    t.checklist=(Array.isArray(t.checklist)?t.checklist:[]).slice(0,100).map(item=>text(item,300));return t;
  }
  function safeSimple(raw,fields){
    const item=pick(raw,fields);
    for(const [key,value] of Object.entries(item))item[key]=typeof value==='string'?text(value,key==='details'?LIMITS.longText:LIMITS.text):safeValue(value);
    return item;
  }
  function validateDatabase(raw){
    rejectForbidden(raw);
    const value=pick(raw,DB_FIELDS);
    return {
      bookings:(Array.isArray(value.bookings)?value.bookings:[]).slice(0,10000).map(safeBooking),
      expenses:(Array.isArray(value.expenses)?value.expenses:[]).slice(0,20000).map(safeExpense),
      cleaningTasks:(Array.isArray(value.cleaningTasks)?value.cleaningTasks:[]).slice(0,20000).map(safeCleaning),
      notifications:(Array.isArray(value.notifications)?value.notifications:[]).slice(0,50000).map(item=>safeSimple(item,NOTIFICATION_FIELDS)),
      customerNotes:value.customerNotes&&typeof value.customerNotes==='object'&&!Array.isArray(value.customerNotes)?Object.fromEntries(Object.entries(value.customerNotes).slice(0,10000).map(([key,item])=>[text(key,200),text(item,LIMITS.longText)])):{},
      backupHistory:(Array.isArray(value.backupHistory)?value.backupHistory:[]).slice(0,10000).map(item=>safeSimple(item,BACKUP_HISTORY_FIELDS)),
      auditLog:(Array.isArray(value.auditLog)?value.auditLog:[]).slice(0,100000).map(item=>safeSimple(item,AUDIT_FIELDS)),
      settings:safeSimple(value.settings,SETTINGS_FIELDS),
      seq:finite(value.seq,{min:1,max:Number.MAX_SAFE_INTEGER,fallback:1})
    };
  }

  global.AdwaaValidation=Object.freeze({parseJson,validateDatabase,text,finite,isoDate,isoDateTime,id,phone,rejectForbidden});
})(window);
