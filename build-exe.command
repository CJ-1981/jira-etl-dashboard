#!/bin/bash
cd "$(dirname "$0")"
bash build-exe.sh
if [ $? -eq 0 ]; then
    echo ""
    echo "Build succeeded! Opening dist folder..."
    open dist
else
    echo ""
    echo "Build failed. Check the output above."
    read -p "Press Enter to close..."
fi