#!/bin/bash

# Memory Health Check Script for Development
# This script helps identify and manage memory issues with Node.js processes

echo "🔍 Memory Health Check for Jira ETL Dashboard"
echo "============================================="
echo ""

# Function to check if running on Windows or Linux/Mac
detect_os() {
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        echo "Windows"
    else
        echo "Unix"
    fi
}

OS=$(detect_os)

# Check current Node.js processes
echo "📊 Current Node.js Processes:"
if [ "$OS" == "Windows" ]; then
    tasklist /FI "IMAGENAME eq node.exe" /FO TABLE
else
    ps aux | grep node | grep -v grep
fi
echo ""

# Check memory usage
echo "💾 Memory Usage:"
if [ "$OS" == "Windows" ]; then
    wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value
else
    free -h
fi
echo ""

# Check Next.js cache size
echo "📦 Cache Sizes:"
if [ -d ".next" ]; then
    echo "Next.js build cache: $(du -sh .next 2>/dev/null || echo 'Unable to determine')"
fi
if [ -d "node_modules/.cache" ]; then
    echo "Node modules cache: $(du -sh node_modules/.cache 2>/dev/null || echo 'Unable to determine')"
fi
echo ""

# Provide recommendations
echo "💡 Recommendations:"

# Check if too many node processes
NODE_COUNT=$(pgrep -o node 2>/dev/null | wc -l || echo "0")
if [ "$OS" == "Windows" ]; then
    NODE_COUNT=$(tasklist /FI "IMAGENAME eq node.exe" 2>/dev/null | find /c "node.exe" || echo "0")
fi

if [ "$NODE_COUNT" -gt 5 ]; then
    echo "⚠️  Warning: Found $NODE_COUNT Node.js processes running"
    echo "   Consider killing unused processes:"
    if [ "$OS" == "Windows" ]; then
        echo "   taskkill /F /IM node.exe"
    else
        echo "   pkill -9 node"
    fi
else
    echo "✅ Node.js process count looks good ($NODE_COUNT processes)"
fi

# Check memory usage
if [ "$OS" == "Windows" ]; then
    # Windows memory check would go here
    echo "ℹ️  Monitor memory usage in Task Manager"
else
    TOTAL_MEM=$(free | grep Mem | awk '{print $2}')
    USED_MEM=$(free | grep Mem | awk '{print $3}')
    MEM_PERCENT=$((USED_MEM * 100 / TOTAL_MEM))

    if [ "$MEM_PERCENT" -gt 80 ]; then
        echo "⚠️  Warning: High memory usage (${MEM_PERCENT}%)"
        echo "   Consider running: npm run dev:clean"
    else
        echo "✅ Memory usage looks good (${MEM_PERCENT}%)"
    fi
fi

echo ""
echo "🔧 Quick Actions:"
echo "   npm run dev:clean    - Clean cache and restart"
echo "   npm run dev:low-memory - Run with limited memory"
echo "   npm run clean        - Clean cache only"
echo ""

# Ask if user wants to clean up
read -p "Would you like to clean the cache? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Cleaning cache..."
    npm run clean
    echo "✅ Cache cleaned!"
    echo ""
    read -p "Start development server? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run dev
    fi
fi