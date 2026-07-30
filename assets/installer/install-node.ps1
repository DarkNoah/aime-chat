param(
  [string]$Version = '22.22.2',

  [ValidateRange(1, 300)]
  [int]$DownloadTimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$msiPath = Join-Path $env:TEMP "aime-chat-node-v$Version-x64.msi"
$downloadPath = "$msiPath.download"
$downloadUrl = "https://nodejs.org/dist/v$Version/node-v$Version-x64.msi"
$installerFinished = $false

try {
  Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue

  Invoke-WebRequest `
    -Uri $downloadUrl `
    -OutFile $downloadPath `
    -UseBasicParsing `
    -TimeoutSec $DownloadTimeoutSeconds

  $signature = Get-AuthenticodeSignature -LiteralPath $downloadPath
  if (
    $signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
    $signature.SignerCertificate.Subject -notmatch 'Microsoft'
  ) {
    throw 'The downloaded Node.js installer does not have a valid Microsoft signature.'
  }

  Move-Item -LiteralPath $downloadPath -Destination $msiPath -Force
  $process = Start-Process `
    -FilePath 'msiexec.exe' `
    -ArgumentList @('/i', "`"$msiPath`"", '/qn', '/norestart') `
    -Wait `
    -PassThru

  $installerFinished = $true
  exit $process.ExitCode
}
catch {
  Write-Output "Node.js download or installation failed: $($_.Exception.Message)"
  exit 2
}
finally {
  Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  if ($installerFinished) {
    Remove-Item -LiteralPath $msiPath -Force -ErrorAction SilentlyContinue
  }
}
