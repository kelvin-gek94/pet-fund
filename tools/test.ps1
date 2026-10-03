# Runs the browser test page headlessly and exits 0 only when every test passes.
# Requires the dev server (tools/serve.ps1) to be running on :5173.
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$profile = Join-Path $env:TEMP 'petfund-test-profile'
$dom = & $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$profile" `
  --virtual-time-budget=5000 --dump-dom 'http://localhost:5173/tests/' 2>$null | Out-String
if ($dom -match '(?s)<pre id="result">(.*?)</pre>') {
  $text = [System.Net.WebUtility]::HtmlDecode($Matches[1]).Trim()
  Write-Output $text
  if ($text -match 'ALL PASS') { exit 0 }
  exit 1
}
Write-Output 'No test result found (is the dev server running?)'
exit 1
