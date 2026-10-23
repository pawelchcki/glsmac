#!/usr/bin/env python3
"""Execute the pinned original uncached cost helper on synthetic owned data.

Only verified addresses, field transport and explicit fixture defaults appear
here. Answers execute original x86 instructions with fresh guarded Unicorn state.
No original algorithm or asset table is transcribed.
"""
import argparse,hashlib,struct,sys
from pathlib import Path
from original import OriginalOracle,load_image,TECH_CATEGORY,ProbeError
from protocol import ProtocolError,load_request,write_response
from research_cost_contract import ALGORITHM,validate_input,validate_output
FUNCTION=('tech_rate',0x005BE6B0,0x005BE931)
FACTIONS=0x0096C9E0
STRIDE=0x20CC

def fixture(d):
    # Eight owned synthetic faction records; no live executable data is copied.
    factions=bytearray(8*STRIDE)
    for i in range(8):struct.pack_into('<i',factions,i*STRIDE+0x3D0,-1)
    at=d['faction_id']*STRIDE
    for offset,key in ((8,'difficulty'),(0x2F8,'research_rating'),(0x35C,'research_ranking'),
                       (0x3CC,'target_id'),(0x3D4,'saved_earned_techs')):
        struct.pack_into('<i',factions,at+offset,d[key])
    fields=((0x00949758,d['discovery_rate_percent']),
            (0x00949888,d['map_area_sqrt']),(0x009A64C4,0),
            (0x009A64D4,d['turn']),(0x009A64E8,1<<d['faction_id']),
            (0x009A649C,0x20 if d['stagnation'] else 0),
            (0x00946F48+1436*d['faction_id'],d['faction_cost_percent']))
    return ((FACTIONS,bytes(factions)),)+tuple((a,struct.pack('<i',v)) for a,v in fields)

def main():
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);args=p.parse_args();request=load_request()
    for c in request['cases']:
        if c['algorithm']!=ALGORITHM:raise ProtocolError('unknown research-cost helper contract')
        validate_input(c['input'])
    oracle=OriginalOracle(load_image(args.exe));results=[]
    for c in request['cases']:
        d=c['input'];answer=oracle.execute(TECH_CATEGORY,(d['faction_id'],),fixture(d),function=FUNCTION)
        output=dict(science_required=answer);validate_output(output);results.append(dict(id=c['id'],status='ok',output=output))
    metadata=oracle.metadata([]);metadata.pop('function',None);metadata.pop('address',None)
    metadata.update(name='smacx-original-research-cost',contract=ALGORITHM,adapter_version=1,
        functions=[dict(name=FUNCTION[0],address=hex(FUNCTION[1]),end=hex(FUNCTION[2]))],
        adapter_sha256=hashlib.sha256(Path(__file__).read_bytes()+Path(__file__).with_name('research_cost_contract.py').read_bytes()).hexdigest(),
        fixture='Human-only, selected faction1..7, cache -1, complete synthetic faction records; rival saved-earned/ranking counters and selected auxiliary adjustment zero; global difficulty0; no diplomacy/base/ownership mapping claim',
        units='Integer science points; original helper return only; not a cost formula or complete research progression contract')
    write_response(metadata,results)
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,ProbeError) as e:print('Original research cost failed: '+str(e),file=sys.stderr);sys.exit(1)
