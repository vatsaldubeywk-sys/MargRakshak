param([switch]$DeployFunctions)

$ErrorActionPreference = "Stop"
$ProjectRef = "mhdnpgzfpnthrrzuooek"
$Functions = @(
  "create-contact",
  "accept-contact",
  "start-session",
  "update-location",
  "create-sos",
  "end-session",
  "revoke-contact"
)

Push-Location $PSScriptRoot
$secureUrl = $null
$ptr = [IntPtr]::Zero
$databaseUrl = $null
try {
  $secureUrl = Read-Host "Paste the full Session pooler URI for project $ProjectRef" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUrl)
  $databaseUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()
  $databaseUrl = $databaseUrl -replace '^postgresql://', 'postgres://'
  $target = [Uri]$databaseUrl
  $username = $target.UserInfo.Split(':')[0]
  if ($target.Scheme -ne "postgres" -or
      $target.Host -ne "aws-1-ap-south-1.pooler.supabase.com" -or
      $target.Port -ne 5432 -or
      $target.AbsolutePath -ne "/postgres" -or
      $username -ne "postgres.$ProjectRef" -or
      $target.UserInfo -match '\[YOUR-PASSWORD\]') {
    throw "The URI does not match the MargRakshak Mumbai Session pooler. Copy the complete URI from Supabase Connect and replace [YOUR-PASSWORD] locally."
  }

  Write-Host "Previewing migrations for project $ProjectRef via the Session pooler."
  npx --yes supabase@latest db push --dry-run "--remote=$databaseUrl"
  if ($LASTEXITCODE -ne 0) { throw "Migration preview failed. No database changes were applied." }

  $confirmation = Read-Host "Type APPLY to apply the listed migration(s) to project $ProjectRef"
  if ($confirmation -cne "APPLY") {
    Write-Host "Cancelled. No database changes were applied."
    return
  }

  npx --yes supabase@latest db push "--remote=$databaseUrl"
  if ($LASTEXITCODE -ne 0) { throw "Database migration push failed." }

  if ($DeployFunctions) {
    Write-Host "The seven functions already deployed for this project matched local source at the last audit."
    $functionConfirmation = Read-Host "Type DEPLOY-FUNCTIONS to redeploy all seven functions anyway"
    if ($functionConfirmation -ceq "DEPLOY-FUNCTIONS") {
      foreach ($FunctionName in $Functions) {
        npx --yes supabase@latest functions deploy $FunctionName --project-ref $ProjectRef --use-api
        if ($LASTEXITCODE -ne 0) { throw "Deploy failed for function $FunctionName." }
      }
    } else {
      Write-Host "Function deployment skipped."
    }
  } else {
    Write-Host "Function deployment skipped. Use -DeployFunctions only when you intend to deploy the current local function sources."
  }
}
finally {
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($secureUrl) { $secureUrl.Dispose() }
  $databaseUrl = $null
  Pop-Location
}

