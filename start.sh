#!/bin/sh
cd "$(dirname "$0")" && echo "打开 http://localhost:8765/index.html" && python3 -m http.server 8765
