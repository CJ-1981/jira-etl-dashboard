#!/bin/bash

# Script to find the correct Issue Owner Team field ID from your Jira instance
# Usage: ./debug-fields.sh <your-jira-base-url> <email> <api-token>

BASE_URL=$1
EMAIL=$2
API_TOKEN=$3

if [ -z "$BASE_URL" ] || [ -z "$EMAIL" ] || [ -z "$API_TOKEN" ]; then
  echo "Usage: $0 <jira-base-url> <email> <api-token>"
  echo "Example: $0 https://your-domain.atlassian.net user@example.com your-api-token"
  exit 1
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
