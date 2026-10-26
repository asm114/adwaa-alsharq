"""Restore recorded extension metadata and provider schema ACLs; parse ACLs.

Only used inside the disposable, network-isolated restore server. Never executes
SQL against the source. No SQL text or custom identifiers are logged.
Grant diagnostics use fixed public schema/role allowlists only.
"""
import json
import re
import subprocess


class MetadataRestoreError(Exception):
    def __init__(self,code,diagnostics):
        self.code=code;self.diagnostics=diagnostics
        super().__init__(code)


def literal(value):
    return "E'"+value.replace('\\','\\\\').replace("'","''")+"'"


def acl_values(requests,sql):
    """Use PostgreSQL's parser, retaining grantor, grantee, privilege and option.

    NULL ACL means acldefault for the object kind/owner, NOT no permissions.
    Array ordering has no privilege semantics. No entries are discarded.
    """
    if not requests:return []
    query="""SELECT coalesce(jsonb_agg(jsonb_build_object('i',v.ordinality,'entries',
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantor',pg_get_userbyid(a.grantor),
        'grantee',CASE WHEN a.grantee=0 THEN NULL ELSE pg_get_userbyid(a.grantee) END,
        'privilege',a.privilege_type,'grantable',a.is_grantable)),'[]'::jsonb)
       FROM aclexplode(coalesce((v.item->>'acl')::aclitem[],
         acldefault((v.item->>'kind')::\"char\",(SELECT oid FROM pg_roles WHERE rolname=v.item->>'owner')))) a))
       ORDER BY v.ordinality),'[]'::jsonb)::text
       FROM jsonb_array_elements("""+literal(json.dumps(requests))+"::jsonb) WITH ORDINALITY v(item,ordinality)"
    parsed=json.loads(sql(query))
    if len(parsed)!=len(requests):raise ValueError('ACL parse incomplete')
    return [sorted(row['entries'],key=lambda x:json.dumps(x,sort_keys=True)) for row in parsed]


def normalized_metadata(value,field,sql):
    """Keep metadata identical except ACL text -> exact PostgreSQL ACL entries."""
    data=json.loads(value) if isinstance(value,str) else json.loads(json.dumps(value))
    rows=[]
    if field=='schema':
        for section,kind in [('schemas','n'),('defaults',None),('routines','f')]:
            for row in data.get(section) or []:rows.append((row,kind or row['type']))
    elif field=='catalog':
        kinds=json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',CASE WHEN c.relkind='S' THEN 'S' ELSE 'r' END)),'[]')::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'"))
        kinds={(r['schema'],r['name']):r['kind'] for r in kinds}
        rows=[(row,kinds[(row['schema'],row['name'])]) for row in data or []]
    requests=[{'acl':r['acl'],'owner':r['owner'],'kind':kind} for r,kind in rows]
    for (row,_),entries in zip(rows,acl_values(requests,sql)):row['acl']=entries
    return data


def restore_extension_metadata(engine,container,verification,sql,bootstrap):
    """pg_dump recreates extensions but does not restore member ownership.

    Reapply the original owner/ACL recorded in the authenticated verification.
    Only pg_depend-confirmed extension objects have ownership replayed.
    Recorded schema/relation grants are replayed when pg_dump omitted
    provider-initial grants. Application owners, RLS, options and all
    definitions are never replaced or ignored.
    """
    expected=engine.application_schema_metadata(verification['schema'])
    source={(r['schema'],r['name'],r['args']):r for r in expected['routines'] or []}
    matches={}
    contexts=['','SET search_path TO "$user", public, extensions;',
              'SET search_path TO public, extensions;','SET search_path TO pg_catalog;']
    for setting in contexts:
        query=setting+"""SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,
          'schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
          'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text)),'[]')::text
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          JOIN pg_depend d ON d.classid='pg_proc'::regclass AND d.objid=p.oid
            AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
          WHERE n.nspname !~ '^pg_' AND p.prokind IN ('f','p','w')"""
        target=json.loads(sql(query))
        for row in target:
            key=(row['schema'],row['name'],row['args'])
            if key in source:
                previous=matches.get(row['oid'])
                if previous and previous[1]!=source[key]:raise ValueError('ambiguous extension routine')
                matches[row['oid']]=(row,source[key])
    if len(matches)!=len(target):raise ValueError('extension routine identity missing')
    signatures=json.loads(sql('SET search_path TO pg_catalog;SELECT coalesce(jsonb_object_agg(oid::text,oid::regprocedure::text),jsonb_build_object())::text FROM pg_proc WHERE oid IN ('+(','.join(str(int(oid)) for oid in matches) or '0')+')'))
    pairs=[]
    for row,expected_row in matches.values():
        pairs.append(({**row,'acl_kind':'f','object_clause':'ROUTINE '+signatures[str(row['oid'])],
                       'alter_clause':'ROUTINE '+signatures[str(row['oid'])]},expected_row))
    relations=json.loads(sql("""SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',c.relname,'kind',c.relkind,
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text)),'[]')::text
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid
        AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
      WHERE n.nspname !~ '^pg_' AND c.relkind IN ('r','p','v','m','S')"""))
    source_relations={(r['schema'],r['name']):r for r in json.loads(verification['catalog'])}
    for row in relations:
        key=(row['schema'],row['name'])
        if key not in source_relations:raise ValueError('extension relation identity missing')
        signature=engine.quote(row['schema'])+'.'+engine.quote(row['name'])
        clause=('SEQUENCE' if row['kind']=='S' else 'TABLE')+' '+signature
        alter={'r':'TABLE','p':'TABLE','v':'VIEW','m':'MATERIALIZED VIEW','S':'SEQUENCE'}[row['kind']]+' '+signature
        pairs.append(({**row,'extension_member':True,'acl_kind':'S' if row['kind']=='S' else 'r',
                       'object_clause':clause,'alter_clause':alter},source_relations[key]))
    extension_relation_keys={(r['schema'],r['name']) for r in relations}
    all_relations=json.loads(sql("""SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',c.relname,'kind',c.relkind,
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text)),'[]')::text
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
        AND c.relkind IN ('r','p','v','m','S')"""))
    ordinals={(r['schema'],r['name']):i for i,r in enumerate(json.loads(verification['catalog']))}
    for row in all_relations:
        key=(row['schema'],row['name']);source_relation=source_relations.get(key)
        if key in extension_relation_keys or source_relation is None:continue
        # As for schemas, restore only original grants, never an unexpected
        # application owner, RLS flags, definitions, options, or missing objects.
        if row['owner']!=source_relation['owner']:continue
        signature=engine.quote(row['schema'])+'.'+engine.quote(row['name'])
        clause=('SEQUENCE' if row['kind']=='S' else 'TABLE')+' '+signature
        pairs.append(({**row,'acl_kind':'S' if row['kind']=='S' else 'r',
                       'object_clause':clause,'alter_clause':None,
                       'source_ordinal':ordinals[key]},source_relation))
    schemas=json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text)),'[]')::text FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'"))
    source_schemas={r['name']:r for r in expected['schemas'] or []}
    for row in schemas:
        source_schema=source_schemas.get(row['name'])
        # Never repair a missing schema or an unexpected schema owner. The full
        # comparison must reject these; only original recorded grants are replayed.
        if source_schema is None or row['owner']!=source_schema['owner']:continue
        pairs.append(({**row,'acl_kind':'n','object_clause':'SCHEMA '+engine.quote(row['name']),
                       'alter_clause':None},source_schema))
    requests=[{'acl':r['acl'],'owner':r['owner'],'kind':pair[0]['acl_kind']} for pair in pairs for r in pair]
    entries=acl_values(requests,sql)
    commands=['BEGIN;']
    repaired={'f':0,'r':0,'S':0,'n':0}
    schema_diagnostics=[];relation_diagnostics=[];extension_relation_repairs=0
    for i,(target,source_row) in enumerate(pairs):
        old,new=entries[2*i:2*i+2]
        if target['owner']==source_row['owner'] and old==new:continue
        repaired[target['acl_kind']]+=1
        owner=source_row['owner'];clause=target['object_clause']
        if target['alter_clause'] is not None:
            commands.append('ALTER '+target['alter_clause']+' OWNER TO '+engine.quote(owner)+';')
        elif target['acl_kind']=='n':
            schema_diagnostics.append(schema_acl_diagnostic(target['name'],old,new))
        else:
            relation_diagnostics.append({'source_ordinal':target['source_ordinal'],**schema_acl_diagnostic(target['schema'],old,new)})
        if target.get('extension_member'):extension_relation_repairs+=1
        grantees={e['grantee'] for e in old+new}|{owner,None}
        for grantee in sorted(grantees,key=lambda r:('' if r is None else r)):
            role='PUBLIC' if grantee is None else engine.quote(grantee)
            commands.append('REVOKE ALL PRIVILEGES ON '+clause+' FROM '+role+' CASCADE;')
        # Owner grants (and grant options) precede delegated grants. Unsupported
        # chains fail closed; the final full ACL comparison is still mandatory.
        allowed={'n':{'CREATE','USAGE'},'f':{'EXECUTE'},'S':{'USAGE','SELECT','UPDATE'},
                 'r':{'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'}}[target['acl_kind']]
        try:ordered=grant_order(new,owner)
        except ValueError:raise MetadataRestoreError('RESTORE_GRANT_CHAIN_UNRESOLVED',schema_diagnostics) from None
        for entry in ordered:
            if entry['privilege'] not in allowed:raise ValueError('unexpected object privilege')
            role='PUBLIC' if entry['grantee'] is None else engine.quote(entry['grantee'])
            commands.extend(['SET LOCAL ROLE '+engine.quote(entry['grantor'])+';',
                'GRANT '+entry['privilege']+' ON '+clause+' TO '+role+(' WITH GRANT OPTION' if entry['grantable'] else '')+';', 'RESET ROLE;'])
    commands.append('COMMIT;')
    payload='\n'.join(commands).encode()
    engine.stage_file(container,'/tmp/extension-metadata',len(payload),lambda sink:sink.write(payload))
    try:
        engine.docker(['exec',container,'psql','-h','127.0.0.1','-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U',bootstrap,'-d','postgres','-f','/tmp/extension-metadata'])
    except subprocess.CalledProcessError as error:
        state=re.search(rb'ERROR:\s+([0-9A-Z]{5})\b',error.stderr or b'')
        code='RESTORE_METADATA_PERMISSION_DENIED' if state and state.group(1)==b'42501' else 'RESTORE_METADATA_REPLAY_FAILED'
        raise MetadataRestoreError(code,schema_diagnostics) from None

    return {'extension_routines_checked':len(matches),'extension_routines_restored':repaired['f'],
            'extension_relations_checked':len(relations),'extension_relations_restored':extension_relation_repairs,
            'relation_acls_restored':len(relation_diagnostics),'relation_acl_restore_diagnostics':relation_diagnostics,
            'schema_acls_restored':repaired['n'],'schema_acl_restore_diagnostics':schema_diagnostics}


def schema_acl_diagnostic(name,before,after):
    from collections import Counter
    known_roles={'postgres','supabase_admin','anon','authenticated','service_role',
                 'authenticator','dashboard_user','supabase_auth_admin',
                 'supabase_storage_admin','supabase_read_only_user','pg_database_owner'}
    known_schemas={'auth','extensions','graphql','graphql_public','net','public',
                   'realtime','storage','supabase_functions','supabase_migrations','vault'}
    aliases={}
    def role(value):
        if value is None:return 'PUBLIC'
        if value in known_roles:return value
        if value not in aliases:aliases[value]='OTHER_ROLE_'+str(len(aliases)+1)
        return aliases[value]
    def safe(entry):
        return {'grantor':role(entry['grantor']),'grantee':role(entry['grantee']),
                'privilege':entry['privilege'],'grantable':entry['grantable']}
    encoded=lambda row:json.dumps(row,sort_keys=True)
    old=Counter(encoded(row) for row in before);new=Counter(encoded(row) for row in after)
    return {'schema':name if name in known_schemas else 'CUSTOM_SCHEMA',
            'restored_grants_before_replay':len(before),'recorded_source_grants':len(after),
            'missing_grants_replayed':[safe(json.loads(row)) for row in (new-old).elements()],
            'extra_grants_removed':[safe(json.loads(row)) for row in (old-new).elements()]}


def grant_order(entries,owner):
    """Rebuild grant-option chains from their owner root without dropping grants."""
    pending=sorted(entries,key=lambda e:(not e['grantable'],json.dumps(e,sort_keys=True)))
    granted=set();ordered=[]
    while pending:
        progress=False
        for entry in pending[:]:
            if entry['grantor']==owner or (entry['grantor'],entry['privilege']) in granted:
                ordered.append(entry);pending.remove(entry);progress=True
                if entry['grantable']:granted.add((entry['grantee'],entry['privilege']))
        if not progress:raise ValueError('unresolvable grant-option chain')
    return ordered
