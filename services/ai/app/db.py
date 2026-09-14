import os
import uuid

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def uid():
    return str(uuid.uuid4())


def connect():
    url = os.environ.get("AI_DATABASE_URL")
    if os.environ.get("APP_ENV", "").lower() == "production" and not url:
        raise ValueError("AI_DATABASE_URL_REQUIRED")
    url = url or os.environ.get("DATABASE_URL")
    if not url: raise ValueError("DATABASE_NOT_CONFIGURED")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=5, options="-c statement_timeout=20000 -c lock_timeout=5000")


def audit(tx, actor, action, resource, resource_id, result="SUCCESS", reason=None, after=None):
    tx.execute('INSERT INTO audit_events(id,actor_id,action,resource_type,resource_id,result,reason,request_id,"after",created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,now())',
               (uid(), actor, action, resource, resource_id, result, reason, uid(), Jsonb(after) if after else None))
