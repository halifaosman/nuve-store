import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formSignature, itnParamString, itnSignatureValid } from '../src/lib/payfast';
import crypto from 'node:crypto';

const [form, itn] = readFileSync(new URL('./vectors.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('form signature matches the official PHP routine (with passphrase)', () => {
  assert.equal(formSignature(form.form, 'jt7NOE43FZPn'), form.sig);
});
test('form signature matches the official PHP routine (no passphrase)', () => {
  assert.equal(formSignature(form.form, ''), form.sigNoPass);
});
test('ITN parameter string and signature match PHP', () => {
  const { paramString, signature, data } = itnParamString(itn.raw);
  assert.equal(paramString, itn.param);
  assert.equal(signature, itn.sig);
  assert.equal(data.name_first, 'Ann & Bo');
  assert.ok(itnSignatureValid(paramString, signature, 'jt7NOE43FZPn'));
  assert.ok(!itnSignatureValid(paramString.replace('200.00', '2.00'), signature, 'jt7NOE43FZPn'));
});
test('Bob Go webhook HMAC check', async () => {
  process.env.BOBGO_WEBHOOK_SECRET = 'whsec_test';
  const { webhookSignatureValid } = await import('../src/lib/bobgo');
  const body = '{"id":1,"channel_order_number":"1001"}';
  const good = crypto.createHmac('sha256', 'whsec_test').update(body).digest('base64');
  assert.ok(webhookSignatureValid(body, good));
  assert.ok(!webhookSignatureValid(body + ' ', good));
  assert.ok(!webhookSignatureValid(body, null));
});
