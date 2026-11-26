param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$candidatePaths = @()
if ($env:AI_CREDIT_PYTHON) { $candidatePaths += $env:AI_CREDIT_PYTHON }
$candidatePaths += (Join-Path $PSScriptRoot '.venv\Scripts\python.exe')
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCommand) { $candidatePaths += $pythonCommand.Source }
$runtimeFolders = Get-ChildItem -LiteralPath 'C:\Program Files\WindowsApps' -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending
foreach ($runtimeFolder in $runtimeFolders) { $candidatePaths += (Join-Path $runtimeFolder.FullName 'dependencies\python\python.exe') }
$selectedPython = $null
foreach ($candidate in $candidatePaths) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    try {
        & $candidate -c 'import pypdf, pypdfium2, reportlab, pdfplumber' 2>$null
        if ($LASTEXITCODE -eq 0) { $selectedPython = $candidate; break }
    } catch { continue }
}
if (-not $selectedPython) {
    Write-Host 'Python with dependencies was not found.'
    Write-Host 'Install Python 3.11+ and run: python -m pip install -r requirements.txt'
    exit 1
}
Write-Host "Open http://127.0.0.1:$Port in your browser. Press Ctrl+C to stop."
& $selectedPython -u (Join-Path $PSScriptRoot 'app.py') --port $Port
