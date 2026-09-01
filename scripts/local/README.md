# scripts/local

本目录放**仅供本机运维使用**的脚本，不参与扩展构建、不被 npm scripts 引用，
也不属于要提交给上游的功能代码。

## pin-music-cdn.ps1

把网易云 / QQ 音乐的 CDN 域名固定到可用的 IPv4，写入系统 hosts 的标记区块。

**要解决的问题**：部分网络环境下，运营商到这些 CDN 的一部分 IPv6 节点存在路由黑洞，
表现为 TCP 能连上但 TLS 无响应，浏览器卡满 8~9 秒后放弃。由于这些域名同时返回
A 和 AAAA 记录，Chromium 会优先尝试 IPv6，落到坏节点就播不出声——UI 上表现为
播放条有歌名和总时长但进度停在 0:00。

**为什么用 hosts**：hosts 里只写 A 记录时，Chromium 不会再去尝试 AAAA，
等价于「只对这些域名禁用 IPv6」，比在网卡上全局关掉 IPv6 精准得多。

### 用法

```powershell
# 只打印将写入的内容，不改 hosts
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local/pin-music-cdn.ps1 -DryRun

# 实际写入（需要管理员）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local/pin-music-cdn.ps1
```

日志：`%ProgramData%\pin-music-cdn.log`
备份：每次写盘前生成 `hosts.bak`

### 定时刷新

CDN 的 IP 会漂，需要定期刷新。计划任务以 SYSTEM + 最高权限运行，静默提权无 UAC 弹窗：

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "<仓库路径>\scripts\local\pin-music-cdn.ps1"'
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT2M'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'PinMusicCdnHosts' `
  -Action $action -Trigger $trigger -Principal $principal

# Register 之后才能设置重复间隔
$t = Get-ScheduledTask -TaskName 'PinMusicCdnHosts'
$t.Triggers[0].Repetition.Interval = 'PT1H'
Set-ScheduledTask -TaskName 'PinMusicCdnHosts' -Trigger $t.Triggers[0]
```

### 实现上的两个关键点

**解析必须指定权威 DNS**（脚本内为 223.5.5.5 / 119.29.29.29 / 180.76.76.76）并加
`-DnsOnly`。否则 `Resolve-DnsName` 会读回 hosts 中自己刚固定的 IP，形成自锁，
IP 永远不会更新。

**选 IP 采用粘滞策略**：先测上次已固定的 IP 是否仍能连通 TCP 443，可连则沿用；
不可连才重新解析并挑第一个可连的。CDN 每次解析返回的节点不同，若不做粘滞，
每小时都会改写 hosts。变更检测只比对区块内的映射条目、忽略时间戳注释，因此幂等。

全部域名解析或连通失败时脚本以 exit 2 退出并保留原 hosts，不会写出空区块。

### 回滚

```powershell
Unregister-ScheduledTask -TaskName 'PinMusicCdnHosts' -Confirm:$false
```

再手动删除 hosts 中 `# BEGIN music-cdn-pin` 与 `# END music-cdn-pin` 之间的内容，
或用 `hosts.bak` 覆盖。

### 注意

脚本以 UTF-8 **带 BOM** + CRLF 保存。PowerShell 5.1 读取无 BOM 的 UTF-8 文件时
会把中文注释解析成乱码，并报 `TerminatorExpectedAtEndOfString`。编辑后请保持该编码。
