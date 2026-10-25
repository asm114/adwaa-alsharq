"""Explicit project identities; no arbitrary project/endpoint supplied by callers."""
import os
TARGETS={'core':'pgdvlklpyrvmwzitsmbw','portal':'ztqqdjryvecscidxxbfe'}
TARGET=os.environ.get('BACKUP_TARGET','core')
if TARGET not in TARGETS:raise ValueError('unknown backup target')
PROJECT=TARGETS[TARGET]
REQUIRED_TABLES={'core':('app_state',),'portal':('customer_portal_resort_info','customer_portal_unavailable_periods','customer_portal_admins')}[TARGET]

def identity_confirmed():
    # Required for real network operations, not for offline archive verification.
    return os.environ.get('BACKUP_CONFIRMED_PROJECT_REF')==PROJECT
