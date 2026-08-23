(()=>{
  const TABLE='resort_calendar_awareness_events';
  let awarenessEvents=[];
  let loading=false;

  function isoLocal(date){
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function awarenessLabel(event){
    if(event.category==='government_holiday')return event.title;
    if(event.category==='school_holiday')return `${event.verification_status==='provisional'?'⚠️':'🎒'} ${event.title}`;
    if(event.category==='school_milestone')return `📚 ${event.title}`;
    return event.title;
  }

  function eventsForDate(date){
    const iso=isoLocal(date);
    return awarenessEvents
      .filter(event=>event.is_active!==false&&iso>=event.start_date&&iso<=event.end_date)
      .map(awarenessLabel);
  }

  if(typeof getSaudiCalendarEvents==='function'){
    const originalGetSaudiCalendarEvents=getSaudiCalendarEvents;
    getSaudiCalendarEvents=function(date){
      const base=originalGetSaudiCalendarEvents(date)||[];
      return [...new Set([...base,...eventsForDate(date)])];
    };
  }

  async function loadCalendarAwarenessEvents(){
    if(loading||!window.supabaseClient)return;
    loading=true;
    try{
      const {data:{session},error:sessionError}=await supabaseClient.auth.getSession();
      if(sessionError||!session?.user){awarenessEvents=[];return}
      const {data,error}=await supabaseClient
        .from(TABLE)
        .select('event_key,title,category,start_date,end_date,verification_status,scope,source_name,source_url,notes,is_active')
        .eq('is_active',true)
        .order('start_date',{ascending:true});
      if(error){
        console.warn('تعذر تحميل تنبيهات المناسبات والإجازات.',error.message);
        return;
      }
      awarenessEvents=data||[];
      if(typeof renderCalendar==='function')renderCalendar();
    }finally{
      loading=false;
    }
  }

  window.loadCalendarAwarenessEvents=loadCalendarAwarenessEvents;
  document.addEventListener('DOMContentLoaded',()=>{loadCalendarAwarenessEvents()});
  if(window.supabaseClient){
    supabaseClient.auth.onAuthStateChange((event,session)=>{
      if(session?.user)setTimeout(()=>loadCalendarAwarenessEvents(),0);
      else if(event==='SIGNED_OUT'){awarenessEvents=[];if(typeof renderCalendar==='function')renderCalendar()}
    });
  }
})();
