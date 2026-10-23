#!/usr/bin/env python3
"""Feed installed source prerequisites to the existing original availability helper.

No installed row bodies are emitted. Output is the bounded observed ID set.
"""
import argparse
import hashlib
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from original import OriginalOracle,load_image,TECH_AVAILABLE,validate_input
from protocol import ProtocolError,load_request,write_response
ALGORITHM='technology.initial_source_eligibility.v1'

def main():
    p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);args=p.parse_args()
    request=load_request();source=(args.assets/'alphax.txt').read_bytes();text=source.decode('cp1252')
    start=text.index('#TECHNOLOGY');end=text.index('\n#',start+1)
    rows=[[v.strip() for v in line.split(';')[0].split(',')]
          for line in text[start:end].splitlines()[1:] if line.split(';')[0].strip()]
    if len(rows)!=89 or any(len(row)!=9 for row in rows):raise ProtocolError('unexpected installed technology schema')
    tokens={row[1]:i for i,row in enumerate(rows)};tokens.update({'None':-1,'Disable':-2})
    oracle=OriginalOracle(load_image(args.assets/'terranx.exe'));results=[]
    for case in request['cases']:
        if case['algorithm']!=ALGORITHM or case['input']!={'owned_ids':[6],'faction_id':1,'expansion_enabled':True}:
            raise ProtocolError('unsupported initial source eligibility fixture')
        values=case['input'];table=[dict(id=i,prerequisites=[tokens[row[6]],tokens[row[7]]],
                                       owners=(1<<values['faction_id']) if i in values['owned_ids'] else 0)
                                   for i,row in enumerate(rows)]
        available=[]
        for i in range(89):
            fixture=dict(tech_id=i,faction_id=values['faction_id'],expansion_enabled=values['expansion_enabled'],technologies=table)
            validate_input(TECH_AVAILABLE,fixture)
            if oracle.probe(TECH_AVAILABLE,fixture)['available']:available.append(i)
        results.append(dict(id=case['id'],status='ok',output=dict(available_ids=available)))
    metadata=oracle.metadata([TECH_AVAILABLE]);metadata.update(contract=ALGORITHM,
        source_sha256=hashlib.sha256(source).hexdigest(),adapter_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        scope='Installed 89-row prerequisites, only Ecology owned by mask faction1, expansion enabled; existing original availability helper queried independently for all89 IDs')
    write_response(metadata,results)
if __name__=='__main__':main()
