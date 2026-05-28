#!/bin/bash

# Script to find the correct Issue Owner Team field ID from your Jira instance
# Usage: ./debug-fields.sh <your-jira-base-url> <email> [api-token via $JIRA_API_TOKEN or prompt]

BASE_URL=$1
EMAIL=$2
API_TOKEN=${JIRA_API_TOKEN:-$3}

if [ -z "$BASE_URL" ] || [ -z "$EMAIL" ]; then
  echo "Usage: $0 <jira-base-url> <email>"
  echo "Example: $0 https://your-domain.atlassian.net user@example.com"
  echo "(API token is read from \$JIRA_API_TOKEN or prompted)"
  exit 1
fi

if [ -z "$API_TOKEN" ]; then
  read -s -p "Enter Jira API Token: " API_TOKEN
  echo ""
fi

echo "Fetching all custom fields from Jira..."
echo ""

curl -s -u "$EMAIL:$API_TOKEN" \
  "$BASE_URL/rest/api/2/field" \
  | jq -r '.[] | select(.name | contains("Owner") or contains("Team") or contains("LTIC") or contains("Issue Owner")) | "\(.id) - \(.name) (custom: \(.custom))"' \
  | tee /tmp/jira-fields.txt

echo ""
echo "=== Results saved to /tmp/jira-fields.txt ==="
echo ""
echo "Look for fields like:"
echo "  - customfield_10132 - Issue Owner Team"
echo "  - customfield_12345 - LTIC"
echo "  - etc."
echo ""
echo "Once you find your field ID, set it as:"
echo "  export REACT_APP_JIRA_ISSUE_OWNER_TEAM_FIELD=your_field_id"
