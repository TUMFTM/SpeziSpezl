#!/bin/bash

EMAIL="spezispezl@mail.de"
DATABASE="spezldb"
DATE=$(date +"%Y-%m-%d")
FILE="/tmp/pg_dump_$DATABASE_$DATE.sql.gz"

sudo -u postgres pg_dump --inserts $DATABASE | gzip > $FILE
mutt -s "PG Dump $DATABASE $DATE" -a $FILE -- $EMAIL < /dev/null
