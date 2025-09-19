#!/usr/bin/env bash
# Stage all modified and new files
git add .
# Commit with a descriptive message
git commit -m "chore: apply latest dashboard fixes and add console endpoint"
# Push to the currently-tracked branch
git push
