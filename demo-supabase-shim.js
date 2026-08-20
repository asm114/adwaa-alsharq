(()=>{
'use strict';
if(window.supabase?.createClient)return;
window.supabase={
  createClient(){
    throw new Error('محاولة اتصال غير متوقعة بقاعدة بيانات خارجية داخل نسخة العرض المحلية.');
  }
};
})();
