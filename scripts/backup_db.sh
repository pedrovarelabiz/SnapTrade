#!/bin/bash
DATE=$(date +%Y-%m-%d)
BACKUP_DIR=/opt/snaptrade-unified/backups
mkdir -p $BACKUP_DIR
sudo -u postgres pg_dump snaptrade_db > $BACKUP_DIR/snaptrade_$DATE.sql
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup completed: snaptrade_$DATE.sql ($(wc -c < $BACKUP_DIR/snaptrade_$DATE.sql) bytes)"
