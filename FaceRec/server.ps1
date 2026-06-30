# ============================================================
#  Face Attendance Demo - offline server (PowerShell, no Node.js)
#  Started automatically by start.bat. Keep the window open.
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootFull = [System.IO.Path]::GetFullPath($root)
$prefix = "http://localhost:5500/"

$mime = @{
  ".html" = "text/html"; ".js" = "text/javascript"; ".css" = "text/css"; ".json" = "application/json";
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".webp" = "image/webp"; ".gif" = "image/gif";
  ".mp4" = "video/mp4"; ".wasm" = "application/wasm"; ".bin" = "application/octet-stream"
}

function ConvertTo-JsonString([string]$s) {
  return '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
}
catch {
  Write-Host "Could not start the server on $prefix" -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host "Tip: make sure nothing else is using port 5500, then try again."
  return
}

Write-Host "Face Attendance demo running at $prefix" -ForegroundColor Green
Write-Host "Keep this window open while you use the app. Close it to stop."

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $urlPath = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($urlPath -eq "/") { $urlPath = "/index.html" }

    $rel = $urlPath.TrimStart("/").Replace("/", "\")
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))

    # Block path traversal outside the project folder.
    if (-not $full.StartsWith($rootFull)) {
      $res.StatusCode = 403; $res.Close(); continue
    }

    if (Test-Path -LiteralPath $full -PathType Container) {
      # Directory -> JSON listing (drives roster auto-discovery).
      $entries = @(Get-ChildItem -LiteralPath $full -Force | ForEach-Object {
          "{""name"":" + (ConvertTo-JsonString $_.Name) + ",""dir"":" + ($(if ($_.PSIsContainer) { "true" } else { "false" })) + "}"
        })
      $json = "[" + ($entries -join ",") + "]"
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
      $res.ContentType = "application/json"
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close(); continue
    }

    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $res.StatusCode = 404; $res.Close(); continue
    }

    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }

    $bytes = [System.IO.File]::ReadAllBytes($full)

    # Support Range requests so <video> seeking works.
    $rangeHeader = $req.Headers["Range"]
    if ($rangeHeader -and ($rangeHeader -match "bytes=(\d*)-(\d*)")) {
      $start = if ($matches[1] -ne "") { [int]$matches[1] } else { 0 }
      $end = if ($matches[2] -ne "") { [int]$matches[2] } else { $bytes.Length - 1 }
      if ($end -ge $bytes.Length) { $end = $bytes.Length - 1 }
      if ($start -lt 0) { $start = 0 }
      $len = $end - $start + 1
      $res.StatusCode = 206
      $res.AddHeader("Accept-Ranges", "bytes")
      $res.AddHeader("Content-Range", "bytes $start-$end/$($bytes.Length)")
      $res.ContentLength64 = $len
      $res.OutputStream.Write($bytes, $start, $len)
      $res.Close(); continue
    }

    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
  }
  catch {
    try { $res.StatusCode = 500; $res.Close() } catch {}
  }
}
