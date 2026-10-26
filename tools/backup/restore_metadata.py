"""Restore extension-owned metadata omitted by pg_dump; compare parsed ACLs.

Only used inside the disposable, network-isolated restore server. Never executes
SQL against the source. No SQL text, identifiers or ACL values are logged.
"""
import json


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
    Only pg_depend-confirmed extension objects are eligible. Application
    objects are not repaired from expected values; strict comparison detects
    their mismatches. Definitions are never replaced or ignored.
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
        pairs.append(({**row,'acl_kind':'S' if row['kind']=='S' else 'r',
                       'object_clause':clause,'alter_clause':alter},source_relations[key]))
    requests=[{'acl':r['acl'],'owner':r['owner'],'kind':pair[0]['acl_kind']} for pair in pairs for r in pair]
    entries=acl_values(requests,sql)
    commands=['BEGIN;']
    repaired={'f':0,'r':0,'S':0}
    for i,(target,source_row) in enumerate(pairs):
        old,new=entries[2*i:2*i+2]
        if target['owner']==source_row['owner'] and old==new:continue
        repaired[target['acl_kind']]+=1
        owner=source_row['owner'];clause=target['object_clause']
        commands.append('ALTER '+target['alter_clause']+' OWNER TO '+engine.quote(owner)+';')
        grantees={e['grantee'] for e in old+new}|{owner,None}
        for grantee in sorted(grantees,key=lambda r:('' if r is None else r)):
            role='PUBLIC' if grantee is None else engine.quote(grantee)
            commands.append('REVOKE ALL PRIVILEGES ON '+clause+' FROM '+role+';')
        # Owner grants (and grant options) precede delegated grants. Unsupported
        # chains fail closed; the final full ACL comparison is still mandatory.
        allowed={'f':{'EXECUTE'},'S':{'USAGE','SELECT','UPDATE'},
                 'r':{'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'}}[target['acl_kind']]
        for entry in sorted(new,key=lambda e:(e['grantor']!=owner,not e['grantable'],json.dumps(e,sort_keys=True))):
            if entry['privilege'] not in allowed:raise ValueError('unexpected object privilege')
            role='PUBLIC' if entry['grantee'] is None else engine.quote(entry['grantee'])
            commands.extend(['SET LOCAL ROLE '+engine.quote(entry['grantor'])+';',
                'GRANT '+entry['privilege']+' ON '+clause+' TO '+role+(' WITH GRANT OPTION' if entry['grantable'] else '')+';', 'RESET ROLE;'])
    commands.append('COMMIT;')
    payload='\n'.join(commands).encode()
    engine.stage_file(container,'/tmp/extension-metadata',len(payload),lambda sink:sink.write(payload))
    engine.docker(['exec',container,'psql','-h','127.0.0.1','-X','-v','ON_ERROR_STOP=1','-U',bootstrap,'-d','postgres','-f','/tmp/extension-metadata'])

    return {'extension_routines_checked':len(matches),'extension_routines_restored':repaired['f'],
            'extension_relations_checked':len(relations),'extension_relations_restored':repaired['r']+repaired['S']}
