import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  assertApplyConfirmation,
  buildPsqlMigrationArgs,
  buildSecureApplyPlanFromData,
  parseDatabaseTarget,
  readApplySecrets
} from '../tools/commercial-secure-apply.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=await readFile(path.join(root,'tools/commercial-secure-apply.mjs'),'utf8');

function fixture(){
  return {
    manifest:{
      schemaVersion:1,
      generatedBy:'commercial-provisioner-phase-1',
      clientId:'CLIENT-0001',
      deploymentId:'sample-resort',
      backends:{core:{projectRef:'coreproject12345'},portal:{projectRef:'portalproj12345'}},
      migrations:{core:'supabase/commercial/core/migrations',portal:'supabase/commercial/portal/migrations'}
    },
    bootstrap:{
      schemaVersion:1,
      property:{
        resortName:'منتجع تجريبي',shortDescription:'وصف قصير',detailedDescription:'وصف تفصيلي',
        checkinTime:'4:00 مساءً',checkoutTime:'2:00 صباحًا',mapsUrl:'https://example.com/maps',
        whatsappUrl:'https://example.com/wa',instagramUrl:'https://example.com/ig',resortAddress:'',
        checkinInstructions:'',features:['ميزة'],bookingRequestsOpen:false,
        closedMessage:'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا.'
      },
      contact:{whatsappNumber:'966500000000',mapsUrl:'https://example.com/maps',instagramUrl:'https://example.com/ig',email:'',contactHours:'يوميًا'}
    },
    runtimeConfig:'clientId:"CLIENT-0001"; coreproject12345; portalproj12345;',
    coreMigrations:['20260820001000_core_admin_and_app_state.sql'],
    portalMigrations:['20260820001000_portal_admin_foundation.sql','20260820002000_portal_property_info.sql']
  };
}

test('Secure Apply يبني خطة Fresh Install محايدة بدون أسرار',()=>{
  const plan=buildSecureApplyPlanFromData(fixture());
  assert.equal(plan.mode,'fresh-install-only');
  assert.equal(plan.clientId,'CLIENT-0001');
  assert.equal(plan.targets.core.projectRef,'coreproject12345');
  assert.equal(plan.targets.portal.projectRef,'portalproj12345');
  assert.equal(plan.safety.dryRunDefault,true);
  assert.equal(plan.safety.secretsFromEnvironmentOnly,true);
});

test('Secure Apply يرفض مسارات migrations غير المعتمدة أو Project Ref مشترك',()=>{
  const wrongPath=fixture();
  wrongPath.manifest.migrations.portal='supabase/migrations';
  assert.throws(()=>buildSecureApplyPlanFromData(wrongPath),/مسارات migrations/);

  const sameTarget=fixture();
  sameTarget.manifest.backends.portal.projectRef=sameTarget.manifest.backends.core.projectRef;
  sameTarget.runtimeConfig+=' coreproject12345';
  assert.throws(()=>buildSecureApplyPlanFromData(sameTarget),/مشروعين منفصلين/);
});

test('Secure Apply يرفض placeholder فعلي أو secret field داخل الحزمة العامة',()=>{
  const placeholder=fixture();
  placeholder.runtimeConfig+=' CHANGE_ME_CORE_PROJECT_REF';
  assert.throws(()=>buildSecureApplyPlanFromData(placeholder),/placeholder فعلي/);

  const secret=fixture();
  secret.manifest.serviceRoleKey='forbidden';
  assert.throws(()=>buildSecureApplyPlanFromData(secret),/لا تحمل أسرارًا/);
});

test('الوضع الافتراضي Dry-run ولا يسمح Apply إلا بتأكيد clientId نفسه',()=>{
  const plan=buildSecureApplyPlanFromData(fixture());
  assert.deepEqual(assertApplyConfirmation(plan,{}),{apply:false,mode:'dry-run'});
  assert.throws(()=>assertApplyConfirmation(plan,{apply:true,confirm:'OTHER'}),/--confirm CLIENT-0001/);
  assert.deepEqual(assertApplyConfirmation(plan,{apply:true,confirm:'client-0001'}),{apply:true,mode:'apply'});
});

test('Apply secrets تأتي من البيئة وتمنع Publishable Key وكلمات المرور القصيرة',()=>{
  const env={
    COMMERCIAL_CORE_DATABASE_URL:'postgresql://postgres:verysecret@db.coreproject12345.supabase.co:5432/postgres',
    COMMERCIAL_PORTAL_DATABASE_URL:'postgresql://postgres:othersecret@db.portalproj12345.supabase.co:5432/postgres',
    COMMERCIAL_CORE_SERVICE_ROLE_KEY:'sb_secret_core_value',
    COMMERCIAL_PORTAL_SERVICE_ROLE_KEY:'sb_secret_portal_value',
    COMMERCIAL_MANAGER_EMAIL:'manager@example.com',
    COMMERCIAL_MANAGER_PASSWORD:'long-password-123'
  };
  const secrets=readApplySecrets(env);
  assert.equal(secrets.managerEmail,'manager@example.com');
  const publicKey={...env,COMMERCIAL_CORE_SERVICE_ROLE_KEY:'sb_publishable_forbidden'};
  assert.throws(()=>readApplySecrets(publicKey),/Publishable Key/);
  const shortPassword={...env,COMMERCIAL_MANAGER_PASSWORD:'short'};
  assert.throws(()=>readApplySecrets(shortPassword),/12 حرفًا/);
});

test('Database URL يجب أن يطابق Project Ref سواء مباشرًا أو عبر pooler',()=>{
  const direct=parseDatabaseTarget('postgresql://postgres:secret@db.coreproject12345.supabase.co:5432/postgres','coreproject12345');
  assert.equal(direct.projectRef,'coreproject12345');
  assert.equal(direct.public.host,'db.coreproject12345.supabase.co');
  assert.equal(direct.pgEnv.PGPASSWORD,'secret');

  const pooler=parseDatabaseTarget('postgresql://postgres.portalproj12345:secret@aws-0-region.pooler.supabase.com:5432/postgres','portalproj12345');
  assert.equal(pooler.projectRef,'portalproj12345');
  assert.throws(()=>parseDatabaseTarget('postgresql://postgres:secret@db.wrongproject123.supabase.co:5432/postgres','coreproject12345'),/لا يطابق Project Ref/);
});

test('psql يطبق مجموعة كل Backend داخل transaction واحدة ولا يحمل URL أو password في argv',()=>{
  const args=buildPsqlMigrationArgs(['/repo/a.sql','/repo/b.sql']);
  assert.ok(args.includes('--single-transaction'));
  assert.deepEqual(args.slice(-4),['-f','/repo/a.sql','-f','/repo/b.sql']);
  assert.doesNotMatch(args.join(' '),/postgresql:\/\/|password|secret/i);
});

test('Secure Apply لا يتيح تمرير الأسرار عبر CLI ولا يكتب ملفات سرية',()=>{
  assert.match(source,/COMMERCIAL_CORE_SERVICE_ROLE_KEY/);
  assert.match(source,/COMMERCIAL_MANAGER_PASSWORD/);
  assert.doesNotMatch(source,/token==='--password'|token==='--service-role'|token==='--secret'/);
  assert.doesNotMatch(source,/writeFile\s*\(/);
  assert.match(source,/--apply/);
  assert.match(source,/--confirm/);
});

test('Fresh-install guard وAuth preflight يسبقان أي migrations فعلية',()=>{
  const applyBody=source.slice(source.indexOf('export async function applySecurePlan'),source.indexOf('function parseArgs'));
  const freshDb=applyBody.indexOf('assertFreshDatabase');
  const freshAuth=applyBody.indexOf('assertFreshAuth');
  const migrate=applyBody.indexOf('applyMigrations');
  assert.ok(freshDb>=0&&freshDb<migrate,'Database fresh-install guard must run before migrations');
  assert.ok(freshAuth>=0&&freshAuth<migrate,'Auth preflight must run before migrations');
});

test('المسارات التجارية الحالية تحتوي فقط migration filenames مرتبة وقابلة للتطبيق',async()=>{
  for(const relative of ['supabase/commercial/core/migrations','supabase/commercial/portal/migrations']){
    const names=(await readdir(path.join(root,relative))).filter(name=>name.endsWith('.sql'));
    assert.ok(names.length>0);
    for(const name of names)assert.match(name,/^\d{14}_[a-z0-9_]+\.sql$/);
    assert.deepEqual([...names].sort(),names,'migration files should remain lexically ordered');
  }
});
