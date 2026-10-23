$root = (Get-Location).Path
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:8765/')
$listener.Start()
Write-Output "Serving $root on http://127.0.0.1:8765/"
while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $relative = $context.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
    $file = Join-Path $root ($relative -replace '/', '\')
    if ((Test-Path -LiteralPath $file -PathType Leaf) -and ((Resolve-Path -LiteralPath $file).Path.StartsWith($root))) {
      $bytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $file).Path)
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $types = @{'.html'='text/html; charset=utf-8';'.css'='text/css; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.json'='application/json; charset=utf-8'}
      $context.Response.ContentType = if ($types.ContainsKey($ext)) {$types[$ext]} else {'application/octet-stream'}
      $context.Response.StatusCode = 200
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $context.Response.StatusCode = 404
    }
    $context.Response.Close()
  } catch { }
}
