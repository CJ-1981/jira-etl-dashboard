$env:Path = "C:\Users\Chimin.Jung\AppData\Local\Programs\Git\bin;C:\Program Files\GitHub CLI;" + $env:Path

$issueBaseline = 5
$reviewBaseline = 4
$inlineBaseline = 28
$interval = 30  # seconds
$polling = $true

Write-Host "🔍 Monitoring PR #16 for new comments..."
Write-Host "   Issue comments: $issueBaseline | Reviews: $reviewBaseline | Inline: $inlineBaseline"
Write-Host "   Polling every ${interval}s. Press Ctrl+C to stop.`n"

while ($polling) {
    Start-Sleep -Seconds $interval

    try {
        $issueCount = gh api repos/CJ-1981/jira-etl-dashboard/issues/16/comments --jq '. | length' 2>&1
        $reviewCount = gh api repos/CJ-1981/jira-etl-dashboard/pulls/16/reviews --jq '. | length' 2>&1
        $inlineCount = gh api repos/CJ-1981/jira-etl-dashboard/pulls/16/comments --jq '. | length' 2>&1

        $timestamp = Get-Date -Format "HH:mm:ss"

        # Check for new comments
        $newIssues = $issueCount - $issueBaseline
        $newReviews = $reviewCount - $reviewBaseline
        $newInline = $inlineCount - $inlineBaseline

        if ($newIssues -gt 0 -or $newReviews -gt 0 -or $newInline -gt 0) {
            Write-Host "🚨 [$timestamp] NEW COMMENTS DETECTED!" -ForegroundColor Yellow
            Write-Host "   +$newIssues issue comments | +$newReviews reviews | +$newInline inline comments" -ForegroundColor Cyan

            # Fetch new issue comments
            if ($newIssues -gt 0) {
                Write-Host "`n📝 New Issue Comments:" -ForegroundColor Green
                gh api repos/CJ-1981/jira-etl-dashboard/issues/16/comments --jq ".[$issueBaseline:][] | \"[$(.user.login)] $(.body)\"" 2>&1
            }

            # Fetch new reviews
            if ($newReviews -gt 0) {
                Write-Host "`n⭐ New Reviews:" -ForegroundColor Green
                gh api repos/CJ-1981/jira-etl-dashboard/pulls/16/reviews --jq ".[$reviewBaseline:][] | \"[$(.user.login)] State: $(.state) | $(.body)\"" 2>&1
            }

            # Fetch new inline comments
            if ($newInline -gt 0) {
                Write-Host "`n💬 New Inline Comments:" -ForegroundColor Green
                gh api repos/CJ-1981/jira-etl-dashboard/pulls/16/comments --jq ".[$inlineBaseline:][] | \"[$(.user.login)] $(.path):$(.line) | $(.body)\"" 2>&1
            }

            # Update baselines
            $issueBaseline = $issueCount
            $reviewBaseline = $reviewCount
            $inlineBaseline = $inlineCount

            Write-Host "`n✅ Baselines updated. Continuing to monitor...`n" -ForegroundColor Green
        } else {
            Write-Host "✅ [$timestamp] No new comments (issues: $issueCount | reviews: $reviewCount | inline: $inlineCount)"
        }
    } catch {
        Write-Host "⚠️  Error polling GitHub: $_" -ForegroundColor Red
    }
}
