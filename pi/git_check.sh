#!/bin/bash

#move this to /home/pi and create cronjob
# crontab -e
# */5 * * * * /home/pi/git_check.sh

cd /home/pi/spezispezl && git checkout main &&
[ $(git rev-parse HEAD) = $(git ls-remote $(git rev-parse --abbrev-ref @{u} | sed 's/\// /g') | cut -f1) ] && echo up to date && exit || \
rm -f /home/pi/deploy.log && (cd /home/pi/spezispezl && git fetch --all && git reset --hard && git pull && chmod a+x ./pi/upload.sh && ./pi/upload.sh && exit) >> /home/pi/deploy.log 2>&1

# git checkout --force "origin/main" && git pull --force "origin/main" 
#cd /home/pi/spezispezl && git checkout main &&
#[ $(git rev-parse HEAD) = $(git ls-remote $(git rev-parse --abbrev-ref @{u} | sed 's/\// /g') | cut -f1) ] && echo up to date || echo need update 