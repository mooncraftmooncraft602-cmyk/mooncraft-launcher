# Building a manifest by hand

Until the official `mooncraft-manifest` CLI ships (Milestone 4), you can roll a
manifest with a one-liner.

## PowerShell (Windows)

```powershell
$root  = "C:\path\to\modpack"
$base  = "https://cdn.mooncraft.gg"
$files = Get-ChildItem -Recurse -File $root |
  Where-Object { $_.FullName -notmatch '\\(saves|logs|crash-reports)\\' } |
  ForEach-Object {
    $rel = $_.FullName.Substring($root.Length+1) -replace '\\','/'
    [pscustomobject]@{
      path   = $rel
      url    = "$base/$rel"
      sha256 = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
      size   = $_.Length
    }
  }

@{
  version   = "1.0.0"
  minecraft = "1.21.1"
  fabric    = "0.16.5"
  java      = 21
  changelog = "Initial release"
  files     = $files
} | ConvertTo-Json -Depth 6 | Out-File manifest.json -Encoding utf8
```

## Bash (Linux/macOS)

```bash
ROOT=./modpack
BASE=https://cdn.mooncraft.gg

jq -n --arg base "$BASE" '{
  version:"1.0.0",
  minecraft:"1.21.1",
  fabric:"0.16.5",
  java:21,
  files: input | map({
    path: .path,
    url:  ($base + "/" + .path),
    sha256: .sha256,
    size: .size
  })
}' <(find "$ROOT" -type f -not -path '*/saves/*' -not -path '*/logs/*' -printf '%P\0' \
     | xargs -0 -I{} sh -c 'echo "{\"path\":\"{}\",\"sha256\":\"$(sha256sum "'$ROOT'/{}" | cut -d" " -f1)\",\"size\":$(stat -c%s "'$ROOT'/{}")}"' \
     | jq -s) > manifest.json
```

## Validation rules the launcher enforces

- `MANIFEST_URL` must start with `https://`
- Every `files[].url` must start with `https://`
- Every `files[].sha256` must be 64 lowercase hex chars
- Every `files[].path` must be relative and free of `..` components
