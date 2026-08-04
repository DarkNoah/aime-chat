param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'

try {
  $process = Start-Process `
    -FilePath $InstallerPath `
    -ArgumentList @('/install', '/quiet', '/norestart') `
    -Wait `
    -PassThru

  exit $process.ExitCode
}
catch {
  Write-Output "Unable to run the VC++ installer: $($_.Exception.Message)"
  exit 1
}
