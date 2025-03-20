#!/bin/bash

# Start Python HTTP server in the background
python3 -m http.server 8000 &

# Store the server process ID
SERVER_PID=$!

# Wait a moment for the server to start
sleep 1

# Open the default browser to the site
open http://localhost:8000

# Print instructions
echo "Server running at http://localhost:8000"
echo "Press Ctrl+C to stop the server"

# Wait for Ctrl+C
trap "kill $SERVER_PID; exit 0" INT
wait
