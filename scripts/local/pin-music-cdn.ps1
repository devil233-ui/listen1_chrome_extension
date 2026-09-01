<#
  pin-music-cdn.ps1
  用途：把音乐平台 CDN 域名固定到可用的 IPv4，绕开运营商到这些 CDN 的 IPv6 路由黑洞。
  行为：只重写 hosts 中带标记的区块，不触碰其它内容；内容无变化则不写盘。
  权限：写 hosts 需要管理员，由计划任务以最高权限静默调用。
  用法：-DryRun 只打印不写盘。
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [int]$TimeoutMs = 2000
)

$ErrorActionPreference = 'Stop'

$HostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$BeginMark = '# BEGIN music-cdn-pin (managed by pin-music-cdn.ps1)'
$EndMark   = '# END music-cdn-pin'
$LogPath   = Join-Path $env:ProgramData 'pin-music-cdn.log'

# 权威 DNS：必须绕开本机解析，否则会读回 hosts 里已固定的旧 IP 形成自锁
$DnsServers = @('223.5.5.5', '119.29.29.29', '180.76.76.76')

$Targets = @(
  'm7.music.126.net', 'm8.music.126.net',
  'm701.music.126.net', 'm702.music.126.net', 'm703.music.126.net', 'm704.music.126.net',
  'm801.music.126.net', 'm802.music.126.net', 'm803.music.126.net', 'm804.music.126.net',
  'p1.music.126.net', 'p2.music.126.net', 'p3.music.126.net', 'p4.music.126.net',
  'interface.music.163.com', 'interface3.music.163.com',
  'aqqmusic.tc.qq.com',
  'ws.stream.qqmusic.qq.com', 'isure.stream.qqmusic.qq.com', 'dl.stream.qqmusic.qq.com',
  'sjy6.stream.qqmusic.qq.com', 'sjy.stream.qqmusic.qq.com',
  'y.gtimg.cn'
)

function Write-Log {
  param([string]$Message)
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Verbose $line
  try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch { }
}

function Resolve-Ipv4 {
  param([string]$Name)
  foreach ($server in $DnsServers) {
    try {
      $answers = Resolve-DnsName -Name $Name -Type A -Server $server -DnsOnly -ErrorAction Stop
      $ips = $answers |
        Where-Object { $_.QueryType -eq 'A' -and $_.IPAddress } |
        Select-Object -ExpandProperty IPAddress -Unique
      if ($ips) { return @($ips) }
    } catch { }
  }
  return @()
}

function Test-Tcp443 {
  param([string]$Ip)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync($Ip, 443)
    if (-not $task.Wait($TimeoutMs)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

# ---- 先读出上次已固定的映射，用于粘滞（sticky）----
$prevPinned = @{}
if (Test-Path $HostsPath) {
  $scanPrev = $false
  foreach ($line in @(Get-Content -Path $HostsPath)) {
    if ($line -eq $BeginMark) { $scanPrev = $true; continue }
    if ($line -eq $EndMark)   { $scanPrev = $false; continue }
    if ($scanPrev -and -not $line.StartsWith('#')) {
      $parts = ($line -replace '\s+', ' ').Trim().Split(' ')
      if ($parts.Count -ge 2) { $prevPinned[$parts[1]] = $parts[0] }
    }
  }
}

# ---- 采集：旧 IP 仍可连则沿用，否则重新解析并挑第一个可连的 ----
$entries = [System.Collections.Generic.List[string]]::new()
$failed  = @()
$rotated = @()

foreach ($name in $Targets) {
  $picked = $null

  if ($prevPinned.ContainsKey($name) -and (Test-Tcp443 -Ip $prevPinned[$name])) {
    $picked = $prevPinned[$name]
  } else {
    $ips = Resolve-Ipv4 -Name $name
    if (-not $ips) { $failed += "$name(no-A)"; continue }
    foreach ($ip in $ips) {
      if (Test-Tcp443 -Ip $ip) { $picked = $ip; break }
    }
    if (-not $picked) { $failed += "$name(unreachable)"; continue }
    if ($prevPinned.ContainsKey($name)) { $rotated += "$name->$picked" }
  }

  $entries.Add(('{0,-16} {1}' -f $picked, $name))
}

$okCount = $entries.Count
if ($okCount -eq 0) {
  Write-Log 'ABORT all targets failed, hosts left untouched'
  exit 2
}

# ---- 组装区块（保持纯 ASCII，避免影响系统解析）----
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$block = @($BeginMark, "# last refresh: $stamp") + @($entries) + @($EndMark)

# ---- 读取现有 hosts，剥离旧区块 ----
$existing = @()
if (Test-Path $HostsPath) { $existing = @(Get-Content -Path $HostsPath) }

$kept = [System.Collections.Generic.List[string]]::new()
$oldEntries = [System.Collections.Generic.List[string]]::new()
$inBlock = $false
foreach ($line in $existing) {
  if ($line -eq $BeginMark) { $inBlock = $true; continue }
  if ($line -eq $EndMark)   { $inBlock = $false; continue }
  if ($inBlock) {
    if (-not $line.StartsWith('#') -and -not [string]::IsNullOrWhiteSpace($line)) {
      $oldEntries.Add((($line -replace '\s+', ' ').Trim()))
    }
  } else {
    $kept.Add($line)
  }
}
while ($kept.Count -gt 0 -and [string]::IsNullOrWhiteSpace($kept[$kept.Count - 1])) {
  $kept.RemoveAt($kept.Count - 1)
}

# ---- 变更检测：只比较区块内的映射条目，忽略时间戳 ----
$newNorm = @($entries | ForEach-Object { ($_ -replace '\s+', ' ').Trim() })
$oldNorm = @($oldEntries)
$changed = $true
if ($oldNorm.Count -eq $newNorm.Count) {
  $diff = @(Compare-Object -ReferenceObject $oldNorm -DifferenceObject $newNorm)
  $changed = ($diff.Count -gt 0)
}

if ($DryRun) {
  $block | ForEach-Object { Write-Output $_ }
  Write-Output "--- ok=$okCount skipped=$($failed.Count) rotated=$($rotated.Count) needWrite=$changed ---"
  if ($failed.Count -gt 0) { Write-Output ("--- skipped: " + ($failed -join ', ')) }
  exit 0
}

if (-not $changed) {
  Write-Log "NOCHANGE ok=$okCount"
  exit 0
}

# ---- 写盘（先备份，失败回滚）----
$final = @($kept) + @('') + $block
$backup = "$HostsPath.bak"
try {
  if (Test-Path $HostsPath) { Copy-Item -Path $HostsPath -Destination $backup -Force }
  Set-Content -Path $HostsPath -Value $final -Encoding ASCII -Force
  ipconfig /flushdns | Out-Null
  Write-Log ("OK wrote={0} skipped={1} rotated={2} [{3}] [{4}]" -f $okCount, $failed.Count, $rotated.Count, ($rotated -join ', '), ($failed -join ', '))
} catch {
  Write-Log "ERROR $($_.Exception.Message)"
  if (Test-Path $backup) { Copy-Item -Path $backup -Destination $HostsPath -Force }
  exit 3
}
