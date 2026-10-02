<#
  Beatris POS bridge (پل کارتخوان) — spec docs/specs/0005-pos-bridge.md
  A tiny HTTP server on 127.0.0.1 that lets the Beatris app (in the browser) send an amount to the shop's card reader
  and read back the bank's answer. Windows PowerShell 5.1 (built into Windows 11), no installs.

  Drivers
    sep      Saman / SEP PC-POS over the LAN: SSP1126 (ISO-8583, MTI 0300, DE64 DES-CBC MAC), TCP port 1197
    sim      simulator for training and tests: approves after a short wait, references start with SIM
    command  any other PSP (e.g. Sadad with its official DLL): runs the program named in pos.json with the amount
             and the charge id, and reads one JSON object from its output:
             {"approved":true,"rrn":"...","card":"1234","terminal":"...","code":"00","message":"..."}

  Endpoints (only for the app's origin; Host must be 127.0.0.1 or localhost)
    GET  /status                 bridge version and whether a charge is running
    POST /charge                 {id, amount (rial), driver, host, port} → starts the charge (same id = same charge)
    GET  /charge/<id>            state: connecting | waiting | approved | declined | cancelled | unknown | error
    POST /charge/<id>/cancel     stop waiting (the terminal itself may still need its cancel key)
    POST /test                   {driver, host, port} → connection test (SEP 410000)

  Settings: %LOCALAPPDATA%\Beatris\pos.json  { "listen": 8765, "origins": ["https://..."], "command": "" }
  The allowed origin also comes from beatris.ini next to this script (written by the installer).
#>
param([int]$Listen = 0, [string]$Origin = '', [string]$DataDir = '')
$ErrorActionPreference = 'Stop'
$BridgeVersion = '1.0.0'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $DataDir) { $DataDir = Join-Path $env:LOCALAPPDATA 'Beatris' }
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }

$Cfg = @{ listen = 8765; origins = @(); command = '' }
$cfgFile = Join-Path $DataDir 'pos.json'
if (Test-Path $cfgFile) {
  $j = Get-Content -Raw -Encoding UTF8 $cfgFile | ConvertFrom-Json
  if ($j.listen) { $Cfg.listen = [int]$j.listen }
  if ($j.origins) { $Cfg.origins = @($j.origins) }
  if ($j.command) { $Cfg.command = [string]$j.command }
}
$ini = Join-Path $Here 'beatris.ini'
if (Test-Path $ini) {
  foreach ($line in Get-Content $ini) { if ($line -match '^url=(.+)$') { $Cfg.origins += $Matches[1].Trim().TrimEnd('/') } }
}
if ($Origin) { $Cfg.origins += $Origin.TrimEnd('/') }
if ($Listen) { $Cfg.listen = $Listen }

# ---------------------------------------------------------------- protocol core (also loaded into each charge runspace)
$CoreSrc = @'
$MacKey = [byte[]](0x23, 0xAB, 0xE1, 0x82, 0xCA, 0xB5, 0x64, 0x7D)
# ISO-8583:1987 field table as this dialect packs it: type (n = BCD digits, a = text, b = raw), length, length digits
$Def = @{}
foreach ($spec in ('2,n,19,2 3,n,6,0 4,n,12,0 5,n,12,0 6,n,12,0 7,n,10,0 8,n,8,0 9,n,8,0 10,n,8,0 11,n,6,0 12,n,6,0 13,n,4,0 14,n,4,0 15,n,6,0 16,n,4,0 17,n,4,0 18,n,4,0 19,n,3,0 20,n,3,0 21,n,3,0 22,n,3,0 23,n,3,0 24,n,3,0 25,n,2,0 26,n,2,0 27,n,1,0 28,n,9,0 29,n,9,0 30,n,9,0 31,n,9,0 32,n,11,2 33,n,11,2 34,b,28,2 35,b,37,2 36,a,104,3 37,a,12,0 38,a,6,0 39,a,2,0 40,a,3,0 41,a,8,0 42,a,15,0 43,a,40,0 44,a,25,2 45,a,76,2 46,a,999,3 47,a,999,3 48,a,999,3 49,a,3,0 50,a,3,0 51,a,3,0 52,b,8,0 53,n,16,0 54,a,120,3 55,a,999,3 56,a,999,3 57,a,999,3 58,a,999,3 59,a,999,3 60,a,999,3 61,a,999,3 62,a,999,3 63,a,999,3 64,b,8,0' -split ' ')) {
  $p = $spec -split ','
  $Def[[int]$p[0]] = @($p[1], [int]$p[2], [int]$p[3])
}

function Get-Bcd([string]$digits) {
  if ($digits.Length % 2) { $digits = '0' + $digits }
  $b = New-Object byte[] ($digits.Length / 2)
  for ($i = 0; $i -lt $b.Length; $i++) { $b[$i] = [Convert]::ToByte($digits.Substring($i * 2, 2), 16) }
  return ,$b
}
function Get-Mac([byte[]]$body) {
  $pad = (8 - ($body.Length % 8)) % 8
  $data = New-Object byte[] ($body.Length + $pad)
  [Array]::Copy($body, $data, $body.Length)
  $des = [System.Security.Cryptography.DES]::Create()
  $des.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $des.Padding = [System.Security.Cryptography.PaddingMode]::None
  $des.Key = $MacKey
  $des.IV = New-Object byte[] 8
  $enc = $des.CreateEncryptor().TransformFinalBlock($data, 0, $data.Length)
  $des.Dispose()
  $mac = New-Object byte[] 8
  [Array]::Copy($enc, $enc.Length - 8, $mac, 0, 8)
  return ,$mac
}
function New-IsoMessage([hashtable]$f) {
  $ms = New-Object System.IO.MemoryStream
  $w = { param([byte[]]$x) $ms.Write($x, 0, $x.Length) }
  & $w (Get-Bcd '0300')
  $bitmap = New-Object byte[] 8
  $fields = @($f.Keys | ForEach-Object { [int]$_ } | Where-Object { $_ -ne 64 } | Sort-Object)
  foreach ($n in ($fields + 64)) { $bitmap[($n - 1) -shr 3] = $bitmap[($n - 1) -shr 3] -bor (0x80 -shr (($n - 1) -band 7)) }
  & $w $bitmap
  foreach ($n in $fields) {
    $d = $Def[$n]; $v = [string]$f[$n]
    if ($d[2]) { & $w (Get-Bcd ($v.Length.ToString().PadLeft($(if ($d[2] -eq 2) { 2 } else { 4 }), '0'))) }
    if ($d[0] -eq 'n') { if ($d[2]) { & $w (Get-Bcd $v) } else { & $w (Get-Bcd $v.PadLeft($d[1], '0')) } }
    elseif ($d[2]) { & $w ([Text.Encoding]::ASCII.GetBytes($v)) }
    else { & $w ([Text.Encoding]::ASCII.GetBytes($v.PadRight($d[1], ' '))) }
  }
  $body = $ms.ToArray()
  & $w (Get-Mac $body)
  return ,$ms.ToArray()
}
function Read-IsoMessage([byte[]]$b) {
  $o = @{ macOk = $false }
  $bm = New-Object byte[] 8
  [Array]::Copy($b, 2, $bm, 0, 8)
  $off = 10
  for ($n = 2; $n -le 64; $n++) {
    if (($bm[($n - 1) -shr 3] -band (0x80 -shr (($n - 1) -band 7))) -eq 0) { continue }
    $d = $Def[$n]; $len = $d[1]
    if ($d[2] -eq 2) { $len = [Math]::Min($len, [int]('{0:X2}' -f $b[$off])); $off += 1 }
    elseif ($d[2] -eq 3) { $len = [Math]::Min($len, [int](('{0:X2}' -f $b[$off]) + ('{0:X2}' -f $b[$off + 1]))); $off += 2 }
    if ($d[0] -eq 'n') {
      $nb = [Math]::Ceiling($len / 2); $hex = ''
      for ($i = 0; $i -lt $nb; $i++) { $hex += '{0:X2}' -f $b[$off + $i] }
      $o[$n] = $hex.Substring($hex.Length - $len); $off += $nb
    } elseif ($d[0] -eq 'b') {
      $hex = ''
      for ($i = 0; $i -lt $len; $i++) { $hex += '{0:X2}' -f $b[$off + $i] }
      $o[$n] = $hex; $off += $len
    } else {
      $o[$n] = [Text.Encoding]::ASCII.GetString($b, $off, $len).TrimEnd([char]0, ' '); $off += $len
    }
  }
  $body = New-Object byte[] ($b.Length - 8)
  [Array]::Copy($b, $body, $body.Length)
  $calc = Get-Mac $body
  $ok = $true
  for ($i = 0; $i -lt 8; $i++) { if ($calc[$i] -ne $b[$b.Length - 8 + $i]) { $ok = $false } }
  $o.macOk = $ok
  return $o
}
function Get-Now { $d = Get-Date; @{ t = $d.ToString('HHmmss'); d = $d.ToString('MMdd') } }

# exact read with a deadline; also stops on cancel or a closed socket
function Read-Exact($client, [int]$count, [DateTime]$deadline, $job) {
  $buf = New-Object byte[] $count; $got = 0
  $s = $client.GetStream()
  while ($got -lt $count) {
    if ($job -and $job.cancel) { return 'cancel' }
    if ([DateTime]::UtcNow -gt $deadline) { return 'timeout' }
    if ($client.Available -gt 0) {
      $r = $s.Read($buf, $got, [Math]::Min($count - $got, $client.Available))
      if ($r -le 0) { return 'closed' }
      $got += $r
    } elseif ($client.Client.Poll(0, [Net.Sockets.SelectMode]::SelectRead) -and $client.Available -eq 0) {
      return 'closed'
    } else { Start-Sleep -Milliseconds 20 }
  }
  return ,$buf
}
# POS→PC frame: 2-byte big-endian length, 5-byte header 60 00 00 00 00, ISO message
function Read-Frame($client, [int]$timeoutMs, $job) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
  $h = Read-Exact $client 2 $deadline $job
  if ($h -is [string]) { return @{ status = $h } }
  $len = $h[0] * 256 + $h[1]
  if ($len -lt 15) { return @{ status = 'bad' } }
  $all = Read-Exact $client $len $deadline $job
  if ($all -is [string]) { return @{ status = $all } }
  $msg = New-Object byte[] ($len - 5)
  [Array]::Copy($all, 5, $msg, 0, $msg.Length)
  try { $m = Read-IsoMessage $msg } catch { return @{ status = 'bad' } }
  return @{ status = 'ok'; m = $m }
}
function Send-Iso($client, [hashtable]$f) {
  $b = New-IsoMessage $f
  $client.GetStream().Write($b, 0, $b.Length)
}
function Open-Pos([string]$hostName, [int]$port) {
  $c = New-Object Net.Sockets.TcpClient
  $ar = $c.BeginConnect($hostName, $port, $null, $null)
  if (-not $ar.AsyncWaitHandle.WaitOne(5000)) { $c.Close(); throw 'NOCONNECT' }
  $c.EndConnect($ar)
  $c.NoDelay = $true
  return $c
}
function Close-Pos($client) {
  if (-not $client) { return }
  try { $n = Get-Now; Send-Iso $client @{ 3 = '000001'; 12 = $n.t; 13 = $n.d; 25 = '14' } } catch {}
  try { $client.Close() } catch {}
}
function Get-Last4([string]$mask) { if ($mask -match '(\d{4})\D*$') { return $Matches[1] } return '' }

$RcText = @{
  '00' = 'تراکنش موفق'; '01' = 'کارت ضبط شد'; '02' = 'مبلغ کمتر از حداقل است'; '03' = 'ارتباط با دستگاه برقرار نیست'; '04' = 'اطلاعات نامعتبر';
  '07' = 'این عملیات روی پایانه مجاز نیست (فعال‌سازی PC-POS را از سامان بخواهید)'; '09' = 'پایانه نامعتبر'; '12' = 'تراکنش نامعتبر'; '14' = 'خطای راه‌اندازی';
  '26' = 'خطای تراکنش'; '30' = 'خطای قالب داده'; '33' = 'تاریخ کارت گذشته است'; '38' = 'رمز بیش از حد مجاز اشتباه وارد شد'; '51' = 'موجودی کافی نیست';
  '55' = 'رمز کارت اشتباه است'; '57' = 'این تراکنش برای دارنده کارت مجاز نیست'; '58' = 'این تراکنش برای پایانه مجاز نیست'; '61' = 'مبلغ بیش از سقف مجاز است';
  '68' = 'پاسخ به‌موقع نرسید'; '75' = 'رمز بیش از حد مجاز اشتباه وارد شد'; '78' = 'کارت غیرفعال است'; '79' = 'مبلغ نامعتبر'; '80' = 'صادرکننده کارت پاسخ نداد';
  '84' = 'صادرکننده کارت پاسخ نداد'; '91' = 'صادرکننده کارت پاسخ نداد'; '96' = 'خطای نامشخص'; '97' = 'ارتباط با مرکز برقرار نیست'; '98' = 'مشتری روی کارتخوان انصراف داد'; '99' = 'کارت به‌موقع کشیده نشد'
}
function Set-Result($job, [string]$state, [string]$code, [string]$message) {
  $job.code = $code
  if (-not $message) { $message = $RcText[$code]; if (-not $message) { $message = "کد پاسخ $code" } }
  $job.message = $message
  $job.state = $state
}

# SEP SSP1126 PC-starter purchase: 15 → 000008 (result) → ACK → 17 → Dispose
function Invoke-SepCharge($job) {
  $c = $null
  try {
    $job.state = 'connecting'
    try { $c = Open-Pos $job.host $job.port } catch { Set-Result $job 'error' '' 'به کارتخوان وصل نشد؛ روشن بودن، کابل شبکه و نشانی IP را بررسی کنید.'; return }
    $n = Get-Now
    $req = @{ 3 = '000000'; 4 = [string]$job.amount; 12 = $n.t; 13 = $n.d; 25 = '14'; 46 = '300'; 49 = '364'; 57 = '1.4.3.0' }
    Send-Iso $c $req
    $r = Read-Frame $c 10000 $job
    if ($r.status -eq 'timeout') {
      # a freshly opened terminal connection sometimes drops the first request: retry once
      Close-Pos $c; Start-Sleep -Milliseconds 600
      try { $c = Open-Pos $job.host $job.port } catch { Set-Result $job 'error' '' 'به کارتخوان وصل نشد.'; return }
      Send-Iso $c $req
      $r = Read-Frame $c 10000 $job
    }
    if ($r.status -eq 'cancel') { Set-Result $job 'cancelled' '' 'لغو شد.'; return }
    if ($r.status -ne 'ok') { Set-Result $job 'error' '' 'کارتخوان درخواست را نپذیرفت (پاسخی نیامد).'; return }
    if (-not $r.m.macOk) { Set-Result $job 'error' '' 'پاسخ کارتخوان معتبر نبود (MAC).'; return }
    if ($r.m[39] -ne '15') {
      $state = 'declined'; if ($r.m[39] -eq '98') { $state = 'cancelled' }
      Set-Result $job $state $r.m[39] ''; return
    }
    $tid = [string]$r.m[41]
    $job.terminal = $tid.Trim()
    $job.state = 'waiting'
    $deadline = [DateTime]::UtcNow.AddSeconds(125)
    while ($true) {
      $left = [int]($deadline - [DateTime]::UtcNow).TotalMilliseconds
      if ($left -le 0) { Set-Result $job 'unknown' '' 'پاسخ نهایی کارتخوان نرسید. رسید کارتخوان را ببینید؛ اگر موفق بود شماره پیگیری را دستی وارد کنید.'; return }
      $r = Read-Frame $c $left $job
      if ($r.status -eq 'cancel') { Set-Result $job 'unknown' '' 'انتظار لغو شد. اگر کارتخوان رسید موفق چاپ کرد، شماره پیگیری را دستی وارد کنید.'; return }
      if ($r.status -ne 'ok') { Set-Result $job 'unknown' '' 'ارتباط با کارتخوان قطع شد. رسید کارتخوان را ببینید؛ اگر موفق بود شماره پیگیری را دستی وارد کنید.'; return }
      $m = $r.m
      if (-not $m.macOk) { Set-Result $job 'unknown' '' 'پاسخ کارتخوان معتبر نبود (MAC). رسید کارتخوان را ببینید.'; return }
      $n = Get-Now
      if ($m[3] -eq '000008') {
        $job.rrn = ([string]$m[37]).Trim(); $job.stan = [string]$m[11]; $job.approval = ([string]$m[38]).Trim()
        $mask = [string]$m[62]; if (-not $mask) { $mask = [string]$m[2] }
        $job.card = Get-Last4 $mask
        if ($m[41]) { $job.terminal = ([string]$m[41]).Trim() }
        $ack = @{ 3 = '000004'; 12 = $n.t; 13 = $n.d; 25 = '14' }; if ($tid) { $ack[41] = $tid }
        try { Send-Iso $c $ack } catch {}
        if ($m[39] -eq '00' -and $job.rrn) { Set-Result $job 'approved' '00' '' } else { Set-Result $job 'declined' ([string]$m[39]) '' }
        $null = Read-Frame $c 10000 $null   # the terminal's closing 17; the result is already final
        return
      }
      if (([string]$m[3]).EndsWith('0003')) {
        $ack = @{ 3 = '000004'; 12 = $n.t; 13 = $n.d; 25 = '14' }; if ($tid) { $ack[41] = $tid }
        Send-Iso $c $ack; continue
      }
      if ($m[39] -and $m[39] -ne '15') {
        $state = 'declined'; if ($m[39] -eq '98' -or $m[39] -eq '99') { $state = 'cancelled' }
        Set-Result $job $state ([string]$m[39]) ''; return
      }
    }
  } catch {
    if ($job.state -ne 'approved') { Set-Result $job 'unknown' '' ("خطای پل: " + $_.Exception.Message) }
  } finally {
    Close-Pos $c
    $job.done = $true
  }
}
function Invoke-SepTest([string]$hostName, [int]$port) {
  $c = $null
  try {
    try { $c = Open-Pos $hostName $port } catch { return @{ ok = $false; message = 'به کارتخوان وصل نشد؛ IP، پورت و کابل شبکه را بررسی کنید.' } }
    $n = Get-Now
    Send-Iso $c @{ 3 = '410000'; 12 = $n.t; 13 = $n.d; 25 = '14'; 49 = '364' }
    $r = Read-Frame $c 10000 $null
    if ($r.status -ne 'ok' -or -not $r.m.macOk) { return @{ ok = $false; message = 'کارتخوان پاسخ نداد؛ حالت PC-POS (اتصال به رایانه) را روی دستگاه فعال کنید.' } }
    if ($r.m[39] -ne '15') { return @{ ok = $false; code = $r.m[39]; message = "کارتخوان نپذیرفت (کد $($r.m[39]))." } }
    $tid = ([string]$r.m[41]).Trim()
    $r2 = Read-Frame $c 10000 $null
    if ($r2.status -eq 'ok' -and $r2.m[3] -eq '410003') {
      $ack = @{ 3 = '000004'; 12 = $n.t; 13 = $n.d; 25 = '14' }; if ($tid) { $ack[41] = $tid }
      Send-Iso $c $ack
      $null = Read-Frame $c 5000 $null
    }
    return @{ ok = $true; terminal = $tid; message = 'کارتخوان آماده است.' }
  } finally { Close-Pos $c }
}
function Invoke-SimCharge($job) {
  try {
    $job.state = 'waiting'; $job.terminal = 'SIM00001'
    $until = [DateTime]::UtcNow.AddMilliseconds(2500)
    while ([DateTime]::UtcNow -lt $until) { if ($job.cancel) { Set-Result $job 'cancelled' '98' ''; return }; Start-Sleep -Milliseconds 50 }
    $job.rrn = 'SIM' + (Get-Random -Minimum 100000000 -Maximum 999999999); $job.stan = '000001'; $job.card = '0000'
    Set-Result $job 'approved' '00' 'تراکنش شبیه‌سازی‌شده — پولی جابه‌جا نشد'
  } finally { $job.done = $true }
}
function Invoke-CommandCharge($job, [string]$command) {
  try {
    $job.state = 'waiting'
    if (-not $command) { Set-Result $job 'error' '' 'برنامه رابط PSP در pos.json تعریف نشده است.'; return }
    $out = & $command ([string]$job.amount) ([string]$job.id) 2>$null | Out-String
    $r = $out | ConvertFrom-Json
    $job.rrn = [string]$r.rrn; $job.card = Get-Last4 ([string]$r.card); $job.terminal = [string]$r.terminal; $job.stan = [string]$r.stan
    if ($r.approved -and $job.rrn) { Set-Result $job 'approved' '00' ([string]$r.message) } else { Set-Result $job 'declined' ([string]$r.code) ([string]$r.message) }
  } catch { Set-Result $job 'unknown' '' ('پاسخ برنامه رابط خوانده نشد: ' + $_.Exception.Message) } finally { $job.done = $true }
}
'@
. ([scriptblock]::Create($CoreSrc))

# ---------------------------------------------------------------- charges and their journal
$Jobs = [ordered]@{}
$Runs = @{}
$journal = Join-Path $DataDir 'pos-journal.jsonl'
$Final = @('approved', 'declined', 'cancelled', 'unknown', 'error')
function Get-JobView($j) { [ordered]@{ id = $j.id; amount = $j.amount; driver = $j.driver; state = $j.state; rrn = $j.rrn; stan = $j.stan; approval = $j.approval; card = $j.card; terminal = $j.terminal; code = $j.code; message = $j.message; at = $j.at } }
if (Test-Path $journal) {
  # charges survive a bridge restart: the app can still ask for an id it started earlier
  foreach ($line in (Get-Content -Encoding UTF8 $journal | Select-Object -Last 200)) {
    try { $o = $line | ConvertFrom-Json; $h = [hashtable]::Synchronized(@{}); foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }; $h.done = $true; $Jobs[[string]$o.id] = $h } catch {}
  }
}
function Save-Job($j) { Add-Content -Encoding UTF8 -Path $journal -Value (Get-JobView $j | ConvertTo-Json -Compress) }
function Start-Charge($j) {
  $rs = [runspacefactory]::CreateRunspace(); $rs.Open()
  $rs.SessionStateProxy.SetVariable('Job', $j)
  $rs.SessionStateProxy.SetVariable('Cmd', $Cfg.command)
  $ps = [powershell]::Create(); $ps.Runspace = $rs
  $run = switch ($j.driver) { 'sep' { 'Invoke-SepCharge $Job' } 'command' { 'Invoke-CommandCharge $Job $Cmd' } default { 'Invoke-SimCharge $Job' } }
  [void]$ps.AddScript($CoreSrc + "`n" + $run)
  $Runs[$j.id] = @{ ps = $ps; rs = $rs; h = $ps.BeginInvoke() }
}
function Update-Runs {
  foreach ($id in @($Runs.Keys)) {
    $r = $Runs[$id]
    if (-not $r.h.IsCompleted) { continue }
    try { $r.ps.EndInvoke($r.h) | Out-Null } catch {}
    $j = $Jobs[$id]
    if ($Final -notcontains $j.state) { Set-Result $j 'unknown' '' 'پل در میانه کار متوقف شد؛ رسید کارتخوان را ببینید.' }
    $j.done = $true
    Save-Job $j
    $r.ps.Dispose(); $r.rs.Dispose(); $Runs.Remove($id)
  }
  while ($Jobs.Count -gt 200) { $Jobs.RemoveAt(0) }
}
function Get-Busy { foreach ($j in $Jobs.Values) { if (-not $j.done) { return $j } } return $null }

# ---------------------------------------------------------------- HTTP
function Send-Http($client, [int]$status, $obj, [hashtable]$headers) {
  $reason = @{ 200 = 'OK'; 202 = 'Accepted'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 409 = 'Conflict'; 500 = 'Internal Server Error' }[$status]
  $body = if ($null -ne $obj) { [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 5)) } else { New-Object byte[] 0 }
  $h = "HTTP/1.1 $status $reason`r`nContent-Type: application/json; charset=utf-8`r`nCache-Control: no-store`r`nConnection: close`r`nContent-Length: $($body.Length)`r`n"
  foreach ($k in $headers.Keys) { $h += "${k}: $($headers[$k])`r`n" }
  $hb = [Text.Encoding]::ASCII.GetBytes($h + "`r`n")
  $s = $client.GetStream(); $s.Write($hb, 0, $hb.Length); if ($body.Length) { $s.Write($body, 0, $body.Length) }; $s.Flush()
}
function Read-Http($client) {
  $client.ReceiveTimeout = 3000
  $s = $client.GetStream(); $ms = New-Object System.IO.MemoryStream; $buf = New-Object byte[] 4096
  $deadline = [DateTime]::UtcNow.AddSeconds(3); $headEnd = -1
  while ($headEnd -lt 0) {
    if ([DateTime]::UtcNow -gt $deadline -or $ms.Length -gt 65536) { return $null }
    $n = $s.Read($buf, 0, $buf.Length); if ($n -le 0) { return $null }
    $ms.Write($buf, 0, $n)
    $text = [Text.Encoding]::ASCII.GetString($ms.ToArray())
    $headEnd = $text.IndexOf("`r`n`r`n")
  }
  $lines = $text.Substring(0, $headEnd) -split "`r`n"
  $first = $lines[0] -split ' '
  $req = @{ method = $first[0]; path = ($first[1] -split '\?')[0]; headers = @{}; body = '' }
  foreach ($l in $lines[1..($lines.Length - 1)]) { $i = $l.IndexOf(':'); if ($i -gt 0) { $req.headers[$l.Substring(0, $i).Trim().ToLower()] = $l.Substring($i + 1).Trim() } }
  $len = 0; if ($req.headers['content-length']) { $len = [int]$req.headers['content-length'] }
  if ($len -gt 16384) { return $null }
  $all = $ms.ToArray(); $have = $all.Length - ($headEnd + 4)
  while ($have -lt $len) { $n = $s.Read($buf, 0, $buf.Length); if ($n -le 0) { break }; $ms.Write($buf, 0, $n); $have += $n }
  $all = $ms.ToArray()
  if ($len) { $req.body = [Text.Encoding]::UTF8.GetString($all, $headEnd + 4, [Math]::Min($len, $all.Length - $headEnd - 4)) }
  return $req
}
function Test-Target($b) {
  $h = [string]$b.host; $p = [int]$b.port
  if ($b.driver -eq 'sep') {
    if ($h -notmatch '^[A-Za-z0-9.\-]{1,253}$') { return 'نشانی IP کارتخوان نامعتبر است.' }
    if ($p -lt 1 -or $p -gt 65535) { return 'پورت کارتخوان نامعتبر است.' }
  }
  return $null
}
function Invoke-Http($client) {
  $req = Read-Http $client
  if (-not $req) { return }
  $origin = $req.headers['origin']
  $cors = @{}
  if ($origin) {
    if ($Cfg.origins -notcontains $origin.TrimEnd('/')) { Send-Http $client 403 @{ error = 'origin not allowed' } @{}; return }
    $cors = @{ 'Access-Control-Allow-Origin' = $origin; 'Vary' = 'Origin' }
  }
  # DNS-rebinding guard: only the loopback names reach the bridge
  if ($req.headers['host'] -notmatch '^(127\.0\.0\.1|localhost)(:\d+)?$') { Send-Http $client 403 @{ error = 'host not allowed' } $cors; return }
  if ($req.method -eq 'OPTIONS') {
    $cors['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $cors['Access-Control-Allow-Headers'] = 'content-type'
    $cors['Access-Control-Max-Age'] = '600'
    if ($req.headers['access-control-request-private-network']) { $cors['Access-Control-Allow-Private-Network'] = 'true' }
    Send-Http $client 204 $null $cors; return
  }
  $b = $null
  if ($req.body) { try { $b = $req.body | ConvertFrom-Json } catch { Send-Http $client 400 @{ error = 'JSON نامعتبر' } $cors; return } }
  $path = $req.path
  if ($req.method -eq 'GET' -and $path -eq '/status') {
    $busy = Get-Busy
    Send-Http $client 200 @{ ok = $true; app = 'beatris-pos'; version = $BridgeVersion; busy = [bool]$busy; command = [bool]$Cfg.command } $cors; return
  }
  if ($req.method -eq 'POST' -and $path -eq '/charge') {
    $id = [string]$b.id
    if ($id -notmatch '^[A-Za-z0-9\-]{8,64}$') { Send-Http $client 400 @{ error = 'شناسه تراکنش نامعتبر است.' } $cors; return }
    if ($Jobs.Contains($id)) { Send-Http $client 200 (Get-JobView $Jobs[$id]) $cors; return }   # same id = same charge, never twice
    $amount = [int64]0; [void][int64]::TryParse([string]$b.amount, [ref]$amount)
    if ($amount -lt 1000 -or $amount -gt 999999999999) { Send-Http $client 400 @{ error = 'مبلغ نامعتبر است.' } $cors; return }
    $driver = [string]$b.driver; if (@('sep', 'sim', 'command') -notcontains $driver) { Send-Http $client 400 @{ error = 'نوع کارتخوان نامعتبر است.' } $cors; return }
    $bad = Test-Target $b; if ($bad) { Send-Http $client 400 @{ error = $bad } $cors; return }
    $busy = Get-Busy
    if ($busy) { Send-Http $client 409 @{ error = 'کارتخوان مشغول تراکنش دیگری است.'; id = $busy.id } $cors; return }
    $j = [hashtable]::Synchronized(@{ id = $id; amount = $amount; driver = $driver; host = [string]$b.host; port = [int]$b.port; state = 'connecting'; rrn = ''; stan = ''; approval = ''; card = ''; terminal = ''; code = ''; message = ''; at = (Get-Date).ToUniversalTime().ToString('o'); cancel = $false; done = $false })
    $Jobs[$id] = $j
    Start-Charge $j
    Send-Http $client 202 (Get-JobView $j) $cors; return
  }
  if ($path -match '^/charge/([A-Za-z0-9\-]{8,64})(/cancel)?$') {
    $id = $Matches[1]
    if (-not $Jobs.Contains($id)) { Send-Http $client 404 @{ error = 'تراکنش پیدا نشد.' } $cors; return }
    $j = $Jobs[$id]
    if ($Matches[2] -and $req.method -eq 'POST') { if (-not $j.done) { $j.cancel = $true } }
    Send-Http $client 200 (Get-JobView $j) $cors; return
  }
  if ($req.method -eq 'POST' -and $path -eq '/test') {
    if (Get-Busy) { Send-Http $client 409 @{ error = 'کارتخوان مشغول تراکنش است.' } $cors; return }
    $bad = Test-Target $b; if ($bad) { Send-Http $client 400 @{ error = $bad } $cors; return }
    $r = switch ([string]$b.driver) {
      'sep' { Invoke-SepTest ([string]$b.host) ([int]$b.port) }
      'command' { if ($Cfg.command) { @{ ok = $true; message = 'برنامه رابط تعریف شده است.' } } else { @{ ok = $false; message = 'برنامه رابط PSP در pos.json تعریف نشده است.' } } }
      default { @{ ok = $true; terminal = 'SIM00001'; message = 'شبیه‌ساز آماده است.' } }
    }
    Send-Http $client 200 $r $cors; return
  }
  Send-Http $client 404 @{ error = 'not found' } $cors
}

$listener = New-Object Net.Sockets.TcpListener ([Net.IPAddress]::Loopback, $Cfg.listen)
try { $listener.Start() } catch { Write-Host "Beatris POS bridge: port $($Cfg.listen) is in use (already running?)"; exit 0 }
Write-Host "Beatris POS bridge $BridgeVersion on http://127.0.0.1:$($Cfg.listen) for $($Cfg.origins -join ', ')"
while ($true) {
  Update-Runs
  if (-not $listener.Pending()) { Start-Sleep -Milliseconds 25; continue }
  $client = $listener.AcceptTcpClient()
  try { Invoke-Http $client } catch { try { Send-Http $client 500 @{ error = $_.Exception.Message } @{} } catch {} } finally { $client.Close() }
}
