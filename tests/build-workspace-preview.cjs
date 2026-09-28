// Build disposable QA pages for a preview branch only. Remove outputs before merge.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; worker-src \'none\'; form-action \'none\'">');
html=html.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>','<script src="tests/workspace-mock.js"></script>');
html=html.replace('<script src="https://accounts.google.com/gsi/client" async defer></script>','');
html=html.replace(/<\/body>\s*<\/html>\s*$/,'<script src="tests/workspace-scenarios.js"></script></body></html>');
fs.writeFileSync(path.join(root,'qa-app.html'),html);
fs.writeFileSync(path.join(root,'qa-preview.html'),`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>معاينة معزولة — أضواء الشرق</title><style>body{margin:0;background:#dde5e0;font:14px system-ui}header{padding:8px;display:flex;gap:8px;flex-wrap:wrap}button{padding:8px}iframe{display:block;margin:auto;border:0;background:white;height:1000px}</style><header>اختبار وهمي بلا اتصال بقاعدة البيانات<button onclick="frame.width=1440">حاسب 1440</button><button onclick="frame.width=1280">لابتوب 1280</button><button onclick="frame.width=768">لوحي 768</button><button onclick="frame.width=390">جوال 390</button><button onclick="frame.width=320">جوال 320</button></header><iframe id="frame" title="نظام الاختبار" src="qa-app.html" width="1280"></iframe></html>`);
