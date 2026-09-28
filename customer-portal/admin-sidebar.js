(() => {
  const sections = [
    {key:'summary',label:'الرئيسية',icon:'⌂',selector:'.portal-summary-card'},
    {key:'info',label:'معلومات المنتجع',icon:'i',selector:'.portal-info-card'},
    {key:'images',label:'الصور',icon:'▧',selector:'.portal-images-card'},
    {key:'calendar',label:'التقويم',icon:'▦',selector:'.portal-unavailable-card'},
    {key:'pricing',label:'الأسعار والمواسم',icon:'﷼',selector:'.portal-pricing-card'},
    {key:'contact',label:'التواصل',icon:'☎',selector:'.portal-contact-card'},
    {key:'feedback',label:'الملاحظات',icon:'✎',heading:'ملاحظات العملاء'},
    {key:'backup',label:'النسخ والسجل',icon:'↻',heading:'النسخ والسجل'}
  ];

  function findSection(item){
    if(item.selector)return document.querySelector(item.selector);
    return [...document.querySelectorAll('.standalone-shell > .portal-admin-card')]
      .find(card=>card.querySelector('h3')?.textContent.trim()===item.heading);
  }

  function installStyles(){
    if(document.getElementById('portalAdminSidebarStyles'))return;
    const style=document.createElement('style');
    style.id='portalAdminSidebarStyles';
    style.textContent=`
      .portal-admin-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px;align-items:start}
      .portal-admin-sidebar{position:sticky;top:14px;background:#123d32;border-radius:18px;padding:12px;box-shadow:0 8px 24px rgba(18,61,50,.13);z-index:20}
      .portal-admin-sidebar-title{color:#fff;font-weight:900;padding:8px 10px 12px;border-bottom:1px solid rgba(255,255,255,.16);margin-bottom:8px}
      .portal-admin-nav{display:grid;gap:6px}
      .portal-admin-nav button{width:100%;display:flex;align-items:center;gap:10px;border:0;border-radius:12px;padding:11px 10px;background:transparent;color:#eaf3ef;font:inherit;font-weight:800;text-align:right;cursor:pointer}
      .portal-admin-nav button:hover{background:rgba(255,255,255,.1)}
      .portal-admin-nav button.active{background:#fff;color:#123d32;box-shadow:0 4px 12px rgba(0,0,0,.12)}
      .portal-admin-nav-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,.12);font-weight:900;flex:0 0 auto}
      .portal-admin-nav button.active .portal-admin-nav-icon{background:#e6f0eb}
      .portal-admin-content{min-width:0}
      .portal-admin-content>.portal-admin-card{display:none!important;margin-top:0}
      .portal-admin-content>.portal-admin-card.portal-admin-section-active{display:block!important}
      .portal-admin-mobile-toggle{display:none;width:100%;min-height:48px;border:0;border-radius:14px;background:#123d32;color:#fff;font:inherit;font-weight:900;padding:10px 14px;margin-bottom:12px;cursor:pointer}
      @media(max-width:900px){
        .portal-admin-layout{display:block}
        .portal-admin-mobile-toggle{display:flex;align-items:center;justify-content:space-between}
        .portal-admin-sidebar{display:none;position:relative;top:auto;margin-bottom:12px}
        .portal-admin-sidebar.open{display:block}
      }
    `;
    document.head.appendChild(style);
  }

  function setup(){
    const shell=document.querySelector('.standalone-shell');
    if(!shell||shell.dataset.sidebarReady==='true')return;
    const mapped=sections.map(item=>({...item,node:findSection(item)})).filter(item=>item.node);
    if(!mapped.length)return;

    installStyles();
    shell.dataset.sidebarReady='true';
    const layout=document.createElement('div');
    layout.className='portal-admin-layout';
    const sidebar=document.createElement('aside');
    sidebar.className='portal-admin-sidebar';
    sidebar.setAttribute('aria-label','أقسام لوحة الإدارة');
    sidebar.innerHTML='<div class="portal-admin-sidebar-title">قائمة الإدارة</div><nav class="portal-admin-nav"></nav>';
    const content=document.createElement('div');
    content.className='portal-admin-content';
    const mobileToggle=document.createElement('button');
    mobileToggle.type='button';
    mobileToggle.className='portal-admin-mobile-toggle';
    mobileToggle.innerHTML='<span>☰ قائمة الإدارة</span><span id="portalAdminCurrentSection">الرئيسية</span>';

    mapped.forEach(item=>content.appendChild(item.node));
    layout.append(sidebar,content);
    shell.append(mobileToggle,layout);
    const nav=sidebar.querySelector('.portal-admin-nav');

    function activate(key,updateHash=true){
      const selected=mapped.find(item=>item.key===key)||mapped[0];
      mapped.forEach(item=>item.node.classList.toggle('portal-admin-section-active',item===selected));
      nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.section===selected.key));
      document.getElementById('portalAdminCurrentSection').textContent=selected.label;
      sidebar.classList.remove('open');
      if(updateHash)history.replaceState(null,'',`#admin-${selected.key}`);
      window.scrollTo({top:Math.max(0,shell.offsetTop-12),behavior:'smooth'});
    }

    mapped.forEach(item=>{
      const button=document.createElement('button');
      button.type='button';
      button.dataset.section=item.key;
      button.innerHTML=`<span class="portal-admin-nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
      button.addEventListener('click',()=>activate(item.key));
      nav.appendChild(button);
    });
    mobileToggle.addEventListener('click',()=>sidebar.classList.toggle('open'));
    const requested=location.hash.startsWith('#admin-')?location.hash.slice(7):'summary';
    activate(requested,false);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);
  else setup();
})();