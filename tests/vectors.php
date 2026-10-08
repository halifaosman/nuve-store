<?php
// Official PayFast signature routine (from their docs/SDK), used as the reference.
function generateSignature($data, $passPhrase = null) {
  $pfOutput = '';
  foreach ($data as $key => $val) { if ($val !== '') { $pfOutput .= $key . '=' . urlencode(trim($val)) . '&'; } }
  $getString = substr($pfOutput, 0, -1);
  if ($passPhrase !== null) { $getString .= '&passphrase=' . urlencode(trim($passPhrase)); }
  return md5($getString);
}
$form = [
  'merchant_id' => '10000100', 'merchant_key' => '46f0cd694581a',
  'return_url' => 'https://nuve.co.za/order/5b9e?t=abc&from=payfast', 'cancel_url' => 'https://nuve.co.za/checkout?cancelled=1001',
  'notify_url' => 'https://nuve.co.za/api/payfast/notify', 'name_first' => "Thandi O'Neil", 'name_last' => 'Nkosi-Smith (Jr)',
  'email_address' => 'thandi+test@example.co.za', 'cell_number' => '0821234567', 'm_payment_id' => '5b9e0f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  'amount' => '348.00', 'item_name' => 'Nuvé order #1001 ~ 2*SnapBun!', 'custom_str1' => '1001',
];
echo json_encode(['form' => $form, 'sig' => generateSignature($form, 'jt7NOE43FZPn'), 'sigNoPass' => generateSignature($form)]), "\n";
// ITN check: in-order, blanks included, up to signature
$itn = ['m_payment_id' => 'SuperUnique1', 'pf_payment_id' => '1089250', 'payment_status' => 'COMPLETE', 'item_name' => 'test product', 'item_description' => '',
  'amount_gross' => '200.00', 'amount_fee' => '-4.60', 'amount_net' => '195.40', 'custom_str1' => '', 'name_first' => 'Ann & Bo', 'email_address' => 'a+b@x.co.za', 'merchant_id' => '10000100'];
$s = ''; foreach ($itn as $k => $v) { $s .= $k . '=' . urlencode($v) . '&'; }
$s = substr($s, 0, -1);
$sig = md5($s . '&passphrase=' . urlencode('jt7NOE43FZPn'));
$raw = http_build_query($itn) . '&signature=' . $sig;
echo json_encode(['raw' => $raw, 'sig' => $sig, 'param' => $s]), "\n";
