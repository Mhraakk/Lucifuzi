// پیامک (spec 0022): every Iranian service gets exactly the request its official SDK sends, success is read its way,
// and a failure is a Persian sentence without the key. A local server stands in for each provider.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { sendCode, checkSmsConfig, smsConfigFromEnv, e164Line, relayUrl, publicSmsView, SmsError, SMS_PROVIDERS } from '../server/sms.mjs';

let srv, base;
const seen = [];
let answer = () => ({ status: 200, body: {} });
before(async () => {
  srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, raw });
      const a = await answer(req, raw);
      if (a.wait) await new Promise((r) => setTimeout(r, a.wait));
      res.writeHead(a.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(typeof a.body === 'string' ? a.body : JSON.stringify(a.body));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());
const last = () => seen.at(-1);
const KEY = 'K3y-SECRET-abc123';
const cfgOf = (raw) => {
  const r = checkSmsConfig(raw);
  assert.ok(!r.error, r.error);
  return r.cfg;
};

test('SMS.ir: POST /v1/send/verify/ با X-API-KEY و قالب و پارامتر؛ status=1 یعنی موفق', async () => {
  answer = () => ({ status: 200, body: { status: 1, message: 'موفق', data: { messageId: 876240022, cost: 1.5 } } });
  const c = cfgOf({ provider: 'smsir', key: KEY, template: '123456' });
  const r = await sendCode(c, '09121234567', '482913', { baseUrl: base });
  assert.equal(r.id, '876240022');
  const q = last();
  assert.equal(q.method, 'POST');
  assert.equal(q.url, '/v1/send/verify/');
  assert.equal(q.headers['x-api-key'], KEY);
  assert.match(q.headers['content-type'], /application\/json/);
  assert.deepEqual(JSON.parse(q.raw), { mobile: '09121234567', templateId: 123456, parameters: [{ name: 'Code', value: '482913' }] });
  // a provider error: its own words, never the key
  answer = () => ({ status: 401, body: { status: 10, message: `کلید وب سرویس نامعتبر است ${KEY}`, data: null } });
  await assert.rejects(sendCode(c, '09121234567', '1', { baseUrl: base }), (e) => e instanceof SmsError && /SMS\.ir: کلید وب سرویس نامعتبر است/.test(e.message) && !e.message.includes(KEY) && /کد 10/.test(e.message));
});

test('کاوه‌نگار: کلید در مسیر، فرم receptor/token/template؛ return.status=200 یعنی موفق', async () => {
  answer = () => ({ status: 200, body: { return: { status: 200, message: 'تایید شد' }, entries: [{ messageid: 8792343, status: 5 }] } });
  const c = cfgOf({ provider: 'kavenegar', key: KEY, template: 'beatris-login' });
  const r = await sendCode(c, '09361234567', '852596', { baseUrl: base });
  assert.equal(r.id, '8792343');
  const q = last();
  assert.equal(q.url, `/v1/${KEY}/verify/lookup.json`);
  assert.match(q.headers['content-type'], /application\/x-www-form-urlencoded/);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(q.raw)), { receptor: '09361234567', token: '852596', template: 'beatris-login' });
  answer = () => ({ status: 418, body: { return: { status: 418, message: 'اعتبار حساب شما کافی نیست' }, entries: null } });
  await assert.rejects(sendCode(c, '09361234567', '1', { baseUrl: base }), /کاوه‌نگار: اعتبار حساب شما کافی نیست \(کد 418\)/);
  // a key with a slash or a plus is still one path segment
  const odd = cfgOf({ provider: 'kavenegar', key: 'ab/c+d=', template: 't' });
  answer = () => ({ status: 200, body: { return: { status: 200 }, entries: [] } });
  await sendCode(odd, '09361234567', '1', { baseUrl: base });
  assert.equal(last().url, '/v1/ab%2Fc%2Bd%3D/verify/lookup.json');
});

test('IPPanel / فراز: POST /v1/api/send، Authorization، پترن با گیرنده ‎+98؛ meta.status=true یعنی موفق', async () => {
  answer = () => ({ status: 200, body: { data: { message_outbox_ids: [1123594208] }, meta: { status: true, message: 'انجام شد', message_code: '200-1' } } });
  const c = cfgOf({ provider: 'ippanel', key: KEY, template: 'abc123xyz', sender: '3000505' });
  assert.equal(c.sender, '+983000505');
  assert.equal(c.param, 'code');
  const r = await sendCode(c, '09120000000', '271828', { baseUrl: base });
  assert.equal(r.id, '1123594208');
  const q = last();
  assert.equal(q.url, '/v1/api/send');
  assert.equal(q.headers.authorization, KEY);
  assert.deepEqual(JSON.parse(q.raw), { sending_type: 'pattern', from_number: '+983000505', code: 'abc123xyz', recipients: ['+989120000000'], params: { code: '271828' } });
  answer = () => ({ status: 401, body: { data: null, meta: { status: false, message: 'اطلاعات وارد شده صحیح نمی باشد', message_code: '400-1' } } });
  await assert.rejects(sendCode(c, '09120000000', '1', { baseUrl: base }), /IPPanel \/ فراز اس‌ام‌اس: اطلاعات وارد شده صحیح نمی باشد \(کد 400-1\)/);
  answer = () => ({ status: 422, body: { data: null, meta: { status: false, message: 'خطای ورودی', message_code: '400-2', errors: { params: ['متغیر code لازم است'] } } } });
  await assert.rejects(sendCode(c, '09120000000', '1', { baseUrl: base }), /خطای ورودی — متغیر code لازم است/);
});

test('قاصدک: POST /Rest/api/v1/WebService/SendOtpSMS با ApiKey، receptors و inputs؛ isSuccess یعنی موفق', async () => {
  answer = () => ({ status: 200, body: { isSuccess: true, statusCode: 200, message: 'با موفقیت انجام شد', data: { items: [{ messageId: 246 }] } } });
  const c = cfgOf({ provider: 'ghasedak', key: KEY, template: 'newOtp' });
  const r = await sendCode(c, '09121112233', '100200', { baseUrl: base, ref: 'r1' });
  assert.equal(r.id, '246');
  const q = last();
  assert.equal(q.url, '/Rest/api/v1/WebService/SendOtpSMS');
  assert.equal(q.headers.apikey, KEY);
  const b = JSON.parse(q.raw);
  assert.deepEqual(b.receptors, [{ mobile: '09121112233', clientReferenceId: 'r1' }]);
  assert.equal(b.templateName, 'newOtp');
  assert.deepEqual(b.inputs, [{ param: 'Code', value: '100200' }]);
  assert.equal(b.udh, false);
  assert.ok(!Number.isNaN(Date.parse(b.sendDate)));
  answer = () => ({ status: 200, body: { isSuccess: false, statusCode: 404, message: 'قالب یافت نشد', data: null } });
  await assert.rejects(sendCode(c, '09121112233', '1', { baseUrl: base }), /قاصدک: قالب یافت نشد \(کد 404\)/);
});

test('ملی‌پیامک: فرم BaseServiceNumber با username/password/text/to/bodyId؛ recId بلند یعنی موفق، عدد کوچک خطا', async () => {
  answer = () => ({ status: 200, body: { Value: '3741437414358121', RetStatus: 1, StrRetStatus: 'Ok' } });
  const c = cfgOf({ provider: 'melipayamak', username: 'shop', key: KEY, template: '12345' });
  const r = await sendCode(c, '09123456789', '555666', { baseUrl: base });
  assert.equal(r.id, '3741437414358121');
  const q = last();
  assert.equal(q.url, '/api/SendSMS/BaseServiceNumber');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(q.raw)), { username: 'shop', password: KEY, text: '555666', to: '09123456789', bodyId: '12345' });
  answer = () => ({ status: 200, body: { Value: '-4', RetStatus: 1, StrRetStatus: 'Ok' } });
  await assert.rejects(sendCode(c, '09123456789', '1', { baseUrl: base }), /ملی‌پیامک: کد متن \(bodyId\) نادرست است یا هنوز تأیید نشده \(کد -4\)/);
  answer = () => ({ status: 200, body: { Value: '2', RetStatus: 1, StrRetStatus: 'Ok' } });
  await assert.rejects(sendCode(c, '09123456789', '1', { baseUrl: base }), /اعتبار کافی نیست/);
});

test('بی‌پاسخی، قطع ارتباط و پاسخ غیر JSON: پیام فارسی روشن، بدون کلید', async () => {
  const c = cfgOf({ provider: 'smsir', key: KEY, template: '1' });
  answer = () => ({ status: 200, wait: 400, body: { status: 1 } });
  await assert.rejects(sendCode(c, '09121234567', '1', { baseUrl: base, timeoutMs: 100 }), (e) => e.reach === false && /پاسخ نداد/.test(e.message));
  await assert.rejects(sendCode(c, '09121234567', '1', { baseUrl: 'http://127.0.0.1:9' }), (e) => e.reach === false && /وصل نشد/.test(e.message));
  answer = () => ({ status: 502, body: '<html>Bad gateway</html>' });
  await assert.rejects(sendCode(c, '09121234567', '1', { baseUrl: base }), /پاسخ نامعتبر \(HTTP 502\)/);
  await assert.rejects(sendCode({ provider: 'nope' }, '09121234567', '1'), /تنظیم نشده/);
});

test('تنظیمات: فیلدهای لازم هر سرویس، عدد بودن قالب، خط فرستنده، متغیرهای سرور، واسط https', () => {
  assert.match(checkSmsConfig({ provider: '' }).error, /انتخاب/);
  assert.match(checkSmsConfig({ provider: 'kavenegar', key: KEY }).error, /نام الگوی تأیید/);
  assert.match(checkSmsConfig({ provider: 'smsir', key: KEY, template: 'abc' }).error, /عدد باشد/);
  assert.match(checkSmsConfig({ provider: 'ippanel', key: KEY, template: 'p' }).error, /شماره خط فرستنده/);
  assert.match(checkSmsConfig({ provider: 'melipayamak', key: KEY, template: '12' }).error, /نام کاربری پنل/);
  assert.match(checkSmsConfig({ provider: 'kavenegar', key: 'a b', template: 't' }).error, /فاصله/);
  assert.match(checkSmsConfig({ provider: 'smsir', key: KEY, template: '1', param: 'کد' }).error, /لاتین/);
  assert.equal(checkSmsConfig({ provider: 'FarazSMS', key: KEY, template: 'p', sender: '+98 3000 505' }).cfg.provider, 'ippanel');
  assert.equal(e164Line('۰۳۰۰۰۵۰۵'), '+983000505');
  assert.equal(e164Line('983000505'), '+983000505');
  assert.equal(smsConfigFromEnv({}), null);
  assert.equal(smsConfigFromEnv({ BEATRIS_SMS_PROVIDER: 'off' }).provider, 'off');
  const env = smsConfigFromEnv({ BEATRIS_SMS_PROVIDER: 'sms.ir', BEATRIS_SMS_API_KEY: KEY, BEATRIS_SMS_TEMPLATE: '100', BEATRIS_SMS_BASE_URL: 'https://relay.example.ir/smsir/' });
  assert.equal(env.provider, 'smsir');
  assert.equal(env.baseUrl, 'https://relay.example.ir/smsir');
  assert.ok(env.fromEnv);
  assert.match(smsConfigFromEnv({ BEATRIS_SMS_PROVIDER: 'kavenegar' }).error, /متغیرهای پیامک سرور/);
  assert.equal(relayUrl('http://evil.example.com'), '');
  assert.equal(relayUrl('https://u:p@relay.example.ir'), '');
  assert.equal(relayUrl('http://127.0.0.1:8080/x'), 'http://127.0.0.1:8080/x');
  const view = publicSmsView({ ...env, key: KEY });
  assert.equal(view.hasKey, true);
  assert.ok(!JSON.stringify(view).includes(KEY));
  assert.equal(SMS_PROVIDERS.length, 5);
  for (const p of SMS_PROVIDERS) for (const f of p.need) assert.ok(p.fields[f], `${p.id}.${f} has a label`);
});

test('واسط داخل ایران (BEATRIS_SMS_BASE_URL): همان مسیرها زیر نشانی واسط', async () => {
  answer = () => ({ status: 200, body: { return: { status: 200 }, entries: [] } });
  const c = { ...cfgOf({ provider: 'kavenegar', key: KEY, template: 't' }), baseUrl: `${base}/relay/kave` };
  await sendCode(c, '09121234567', '1');
  assert.equal(last().url, `/relay/kave/v1/${KEY}/verify/lookup.json`);
});
