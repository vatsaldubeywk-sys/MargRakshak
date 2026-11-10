$ErrorActionPreference = "Stop"
$ProjectRef = "mhdnpgzfpnthrrzuooek"
$Functions = @("create-contact", "create-sos", "start-session", "check-in", "process-missed-checkins")

Push-Location $PSScriptRoot
try {
  Write-Host "Deploying email-enabled functions to Marg Rakshak ($ProjectRef)."
  Write-Host "Set RESEND_API_KEY and RESEND_FROM_EMAIL in Supabase Edge Function Secrets before expecting email alerts."
  $confirmation = Read-Host "Type DEPLOY-EMAIL to deploy these five functions from local source"
  if ($confirmation -cne "DEPLOY-EMAIL") {
    Write-Host "Cancelled. No functions were deployed."
    return
  }
  foreach ($FunctionName in $Functions) {
    npx --yes supabase@latest functions deploy $FunctionName --project-ref $ProjectRef --use-api
    if ($LASTEXITCODE -ne 0) { throw "Deploy failed for function $FunctionName." }
  }
  Write-Host "Alert functions deployed. Provider acceptance is not a delivery receipt. Configure the Cron job described in README.md."
}
finally {
  Pop-Location
}

