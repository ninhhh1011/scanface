param([ValidateSet('start','stop','status')][string]$Action='status', [ValidateSet('dev','preview')][string]$WebMode='dev')
$ErrorActionPreference='Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
$statePath=Join-Path $projectRoot '.local/services.json'
$entries=@()
if(Test-Path -LiteralPath $statePath) { $entries=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json; if($null -eq $entries) { $entries=@() } }
function Is-Owned($entry) {
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.pid)" -ErrorAction SilentlyContinue
  return $process -and $process.CreationDate.ToUniversalTime().ToString('o') -eq $entry.created -and $process.ExecutablePath -eq $entry.executable
}
if($Action -eq 'stop') {
  foreach($entry in $entries) {
    if(Is-Owned $entry) {
      # Only the process tree created by this script; PID creation time prevents reuse mistakes.
      & taskkill.exe /PID $entry.pid /T /F | Out-Null
      Write-Output "$($entry.name): stopped"
    }
  }
  '[]' | Set-Content -LiteralPath $statePath
  Write-Output 'PostgreSQL volume retained. Use npm run infra:down to stop the database.'
  exit 0
}
if($Action -eq 'start') {
  if(!(Test-Path -LiteralPath '.env')) { throw 'Run npm run setup first' }
  $python=Join-Path $projectRoot 'services/ai/.venv/Scripts/python.exe'
  if(!(Test-Path -LiteralPath $python)) { throw 'Create Python 3.12 environment as documented in README' }
  & docker compose --env-file .env -f infra/compose.yaml up -d --wait
  if($LASTEXITCODE -ne 0) { throw 'Database startup failed' }
  New-Item -ItemType Directory -Path '.local' -Force | Out-Null
  $entries=@($entries | Where-Object { Is-Owned $_ })
  $commands=@(
    @{name='ai';file=$python;args=@('services/ai/run-local.py');port=8000},
    @{name='jobs';file=$python;args=@('services/ai/run-local.py','worker');port=0},
    @{name='web';file=$env:ComSpec;args=@('/d','/s','/c',$(if($WebMode -eq 'preview'){'npm run preview:cloudflare'}else{'npm run dev'}));port=3000}
  )
  foreach($command in $commands) {
    if($entries.name -contains $command.name) { continue }
    if($command.port -and (Get-NetTCPConnection -State Listen -LocalPort $command.port -ErrorAction SilentlyContinue)) {
      Write-Output "$($command.name): existing listener retained; not managed by this script"; continue
    }
    $process=Start-Process -FilePath $command.file -ArgumentList $command.args -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput ".local/$($command.name).out.log" -RedirectStandardError ".local/$($command.name).err.log" -PassThru
    $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
    $entries+=@{name=$command.name;pid=$process.Id;created=$info.CreationDate.ToUniversalTime().ToString('o');executable=$info.ExecutablePath}
  }
  ConvertTo-Json -InputObject @($entries) | Set-Content -LiteralPath $statePath
  foreach($port in @(8000,3000)) {
    $deadline=(Get-Date).AddSeconds(20)
    while(!(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if(!(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { throw "Service port $port did not start; inspect .local logs. Owned processes remain tracked for stop." }
  }
  Write-Output 'Processes started; readiness is checked by npm run doctor. Logs: .local/*.log'
}
foreach($entry in $entries) { Write-Output "$($entry.name): $(if(Is-Owned $entry){'RUNNING'}else{'STOPPED'})" }
foreach($port in @(3000,8000,54329)) { Write-Output "Port ${port}: $(if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){'LISTENING'}else{'NOT_LISTENING'})" }
