# Local test server for the lecture room (no install needed, Windows PowerShell)
# Serves the lecture-room folder at http://localhost:8765/  - close this window to stop.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8765
$prefix = "http://localhost:$port/"
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8';
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8';
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon';
  '.md' = 'text/plain; charset=utf-8'; '.sql' = 'text/plain; charset=utf-8'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Host "Could not start on port $port. Is another test server window already open?" -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}
Write-Host ""
Write-Host "  Lecture room test server is running" -ForegroundColor Green
Write-Host "  Open: $prefix" -ForegroundColor Yellow
Write-Host "  Close this window to stop."
Write-Host ""
Start-Process $prefix
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $path -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $bytes = [System.IO.File]::ReadAllBytes($path)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    Write-Host ("{0}  {1}  {2}" -f (Get-Date -Format 'HH:mm:ss'), $res.StatusCode, $rel)
  } catch {
    Write-Host $_ -ForegroundColor Red
  } finally {
    $res.OutputStream.Close()
  }
}
