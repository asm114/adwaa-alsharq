import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  assertPathOutsideRepository,
  buildProvisioningArtifacts,
  validateProvisioningInput
} from '../tools/commercial-provisioner.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const template=await readFile(path.join(root,'supabase-config.staging.js'),'utf8');

function validInput(){
  return {
    clientId:'CLIENT-0001',
    deploymentId:'sample-resort',
    runtimeEnvironment:'staging',
    basePath:'/sample-resort/',
    authorizedCustomer:'منشأة تجريبية',
    brand:{
      name:'النسخة التجريبية',
      businessType:'منتجع',
      location:'موقع تجريبي',
      description:'وصف تجريبي محايد لاختبار تجهيز النسخة التجارية.'
    },
    backends:{
      core:{projectRef:'coreproject12345',publishableKey:'sb_publishable_test_core_123456'},
      portal:{projectRef:'portalproj12345',publishableKey:'sb_publishable_test_portal_123456'}
    },
    portal:{
      property:{
        resortName:'منتجع النسخة التجريبية',
        shortDescription:'وصف قصير للمنشأة التجريبية.',
        detailedDescription:'وصف تفصيلي محايد يستخدم فقط في اختبار Provisioner التجاري.',
        checkinTime:'4:00 مساءً',
        checkoutTime:'2:00 صباحًا',
        mapsUrl:'https://example.com/maps',
        whatsappUrl:'https://example.com/whatsapp',
        instagramUrl:'https://example.com/instagram',
        resortAddress:'عنوان تجريبي',
        checkinInstructions:'',
        features:['ميزة تجريبية'],
        bookingRequestsOpen:false
      },
      contact:{
        whatsappNumber:'966500000000',
        mapsUrl:'https://example.com/maps',
        instagramUrl:'https://example.com/instagram',
        email:'contact@example.com',
        contactHours:'يوميًا من 9 صباحًا إلى 9 مساءً'
      }
    }
  };
}

test('Provisioner يبني حزمة مكتملة بدون CHANGE_ME ويشتق العزل من deploymentId',()=>{
  const result=buildProvisioningArtifacts(template,validInput());
  const runtime=result.files['supabase-config.staging.js'];
  assert.doesNotMatch(runtime,/CHANGE_ME_/);
  assert.match(runtime,/commercial:sample-resort:storage/);
  assert.match(runtime,/commercial-sample-resort-auth/);
  assert.match(runtime,/commercial-sample-resort-cache/);
  assert.match(runtime,/CLIENT-0001/);
  assert.match(runtime,/عبدالعزيز الفوزان/);
  assert.match(runtime,/coreproject12345/);
  assert.match(runtime,/portalproj12345/);
  assert.match(runtime,/runtimeEnvironment:"staging"/);
});

test('Manifest لا يكرر Publishable Keys ولا يحتوي أسرارًا',()=>{
  const result=buildProvisioningArtifacts(template,validInput());
  const manifest=result.files['provisioning-manifest.json'];
  assert.doesNotMatch(manifest,/sb_publishable_/);
  assert.doesNotMatch(manifest,/service.?role|password|access.?token|refresh.?token/i);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.backends.core.projectRef,'coreproject12345');
  assert.equal(parsed.backends.portal.projectRef,'portalproj12345');
  assert.equal(parsed.ownership.ownerName,'عبدالعزيز الفوزان');
  assert.equal(parsed.ownership.authorizedCustomer,'منشأة تجريبية');
});

test('Portal bootstrap يبقى بيانات عامة ويغلق طلبات الحجز افتراضيًا',()=>{
  const input=validInput();
  delete input.portal.property.bookingRequestsOpen;
  const result=buildProvisioningArtifacts(template,input);
  const bootstrap=JSON.parse(result.files['portal-bootstrap.json']);
  assert.equal(bootstrap.property.bookingRequestsOpen,false);
  assert.equal(bootstrap.contact.whatsappNumber,'966500000000');
  assert.equal(bootstrap.property.features.length,1);
});

test('Provisioner يرفض Service Role وكلمات المرور والحقول غير المعروفة',()=>{
  const withSecret=validInput();
  withSecret.backends.core.serviceRoleKey='forbidden';
  assert.throws(()=>validateProvisioningInput(withSecret),/مرفوض/);

  const withPassword=validInput();
  withPassword.password='forbidden';
  assert.throws(()=>validateProvisioningInput(withPassword),/مرفوض/);

  const withUnknown=validInput();
  withUnknown.customerDatabase='unexpected';
  assert.throws(()=>validateProvisioningInput(withUnknown),/غير معروف|غير مسموح/);
});

test('Provisioner يرفض مشاركة نفس Backend بين Core وPortal',()=>{
  const input=validInput();
  input.backends.portal.projectRef=input.backends.core.projectRef;
  assert.throws(()=>validateProvisioningInput(input),/مشروعين منفصلين/);
});

test('Provisioner يرفض القيم غير المعبأة في المثال',async()=>{
  const example=JSON.parse(await readFile(path.join(root,'tools/provisioner.example.json'),'utf8'));
  assert.throws(()=>validateProvisioningInput(example),/placeholder/);
});

test('CLI safety يمنع كتابة حزمة العميل داخل المستودع العام',()=>{
  assert.throws(()=>assertPathOutsideRepository(path.join(root,'private-client'),root),/خارج المستودع العام/);
  const outside=path.resolve(root,'..','provisioner-output-test');
  assert.equal(assertPathOutsideRepository(outside,root),outside);
});
