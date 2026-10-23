"""Observe the original UI with declared own tutorial and label overrides."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from protocol import ProtocolError,load_request,write_response
from ui import interface_tour_original as original
from ui import interface_tour_inputs as inputs
from ui import interface_tour_synthetic_contract as contract


def fingerprint():
    digest=hashlib.sha256(original.fingerprint().encode())
    for path in (Path(__file__),Path(inputs.__file__),Path(contract.__file__)):
        digest.update(path.read_bytes())
    return digest.hexdigest()


def block_bounds(lines,tag):
    starts=[i for i,line in enumerate(lines) if line.strip()=='#'+tag]
    if len(starts)!=1:raise ProtocolError('Ambiguous original source block: '+tag)
    start=starts[0]
    end=next((i for i in range(start+1,len(lines)) if re.fullmatch(r'#[A-Z][A-Z0-9_]*',lines[i].strip())),len(lines))
    return start,end


def patch_tutorial(raw,profile):
    lines=raw.decode('latin1').splitlines(keepends=True)
    replacements=[]
    for tag,entry in inputs.declarations(profile)['tutorial_dialogs'].items():
        start,end=block_bounds(lines,tag)
        body=['#'+tag,'#xs 300']
        if 'button' in entry:body.append('#button '+entry['button'])
        for index,paragraph in enumerate(entry['paragraphs']):
            if index:body.append('^')
            body.append(paragraph)
        replacements.append((start,end,'\r\n'.join(body)+'\r\n\r\n'))
    for start,end,text in sorted(replacements,reverse=True):lines[start:end]=[text]
    return ''.join(lines).encode('latin1')


def patch_labels(raw,profile):
    lines=raw.decode('latin1').splitlines(keepends=True)
    start,end=block_bounds(lines,'LABELS')
    positions=[i for i in range(start+1,end) if lines[i].strip() and not lines[i].lstrip().startswith((';','#'))]
    overrides=inputs.declarations(profile)['label_overrides']
    if len(positions)<=max(overrides):raise ProtocolError('Original label block lacks declared ordinals')
    for index,label in overrides.items():lines[positions[index]]=label+'\r\n'
    return ''.join(lines).encode('latin1')


def documents(raw):
    result={}
    for block in re.split(r'(?m)^#(?=[A-Z])',raw.decode('latin1'))[1:]:
        lines=block.splitlines();tag=lines[0].strip()
        if tag.startswith('TOUR') or tag=='LANDFALL':
            body=' '.join(line for line in lines[1:] if not line.startswith('#'))
            result[tag]=original.tokens(re.sub(r'\$[A-Z0-9]+','',body))
    return result


def topic(vision,image,docs):
    texts=[line['text'] for line in original.read(vision,image) if not line['text'].startswith('OCR ERROR')]
    actual=original.tokens(' '.join(texts))
    if len(actual)<4:raise original.VisionError('No complete original synthetic tutorial body')
    scores=sorted(((len(actual & words)/len(actual | words),tag) for tag,words in docs.items()),reverse=True)
    score,tag=scores[0]
    if score<.35:raise original.VisionError('Unknown actual synthetic tutorial body')
    others=[value for value in scores if contract.TOPICS.get(value[1],value[1])!=contract.TOPICS.get(tag,tag)]
    if others and score-others[0][0]<.09:raise original.VisionError('Ambiguous actual synthetic tutorial body')
    return tag


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets',type=Path,required=True);parser.add_argument('--wine',required=True)
    parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args()
    cases=load_request()['cases']
    for case in cases:
        if case['algorithm']!=contract.ALGORITHM:raise ProtocolError('Unsupported synthetic tutorial algorithm')
        contract.validate_input(case['input'])
    initial=fingerprint();args.artifacts.mkdir(parents=True,exist_ok=True)
    work=Path(tempfile.mkdtemp(prefix='capture-',dir=args.artifacts))
    observer=original.FactionVision();vision=original.JobVision();menu=original.IngameMenuVision();driver=None
    try:
        driver=original.OriginalDriver(args.assets,args.wine,work)
        def asset(name):
            paths=[p for p in (driver.work/'game').iterdir() if p.name.lower()==name]
            if len(paths)!=1:raise ProtocolError('Ambiguous declared original source file: '+name)
            return paths[0]
        tutor_path,label_path=asset('tutor.txt'),asset('labels.txt')
        tutor_base,label_base=tutor_path.read_bytes(),label_path.read_bytes();results=[]
        for case in cases:
            profile=case['input']['source_profile'];declaration=inputs.declarations(profile)
            tutor=patch_tutorial(tutor_base,profile);labels=patch_labels(label_base,profile)
            tutor_path.write_bytes(tutor);label_path.write_bytes(labels)
            directory=work/case['id'];directory.mkdir();original.prepare(driver,observer,vision,directory)
            docs=documents(tutor);frames=[];private=[];initial_units=original.owned_units(driver)
            def capture(path,tag=None):
                image=vision.Image.open(path).convert('RGB')
                panel=image.crop((889,358,1023,517))
                comm=sum(p==(11,18,24) for p in panel.getdata())>4000
                comm_text=vision.text(image,(897,360,1017,384)) if comm else None
                return {'topic':contract.TOPICS.get(tag,tag) if tag else 'map',
                        'buttons':[row['label'] for row in original.buttons(menu,image)],
                        'menu_open':menu.headers(image) is not None,'commlink_open':comm,
                        'commlink_text':comm_text,'native_turn':original.native_turn(driver)}
            path=directory/'prelude-tour-prompt.png'
            observed=topic(observer.vision,vision.Image.open(path),docs)
            if observed!='LANDFALL':raise ProtocolError('Declared synthetic opening prompt is absent')
            frame=capture(path,observed);frames.append(frame);private.append(dict(image=path.name,**frame))
            targets=[row for row in original.buttons(menu,vision.Image.open(path).convert('RGB')) if row['label']==declaration['controls']['tour']]
            if len(targets)!=1:raise ProtocolError('Actual declared Tour control is absent')
            driver.click(targets[0]['x'],targets[0]['y'])
            for step in range(45):
                path=directory/f'page-{step:02d}.png'
                if case['input']['finish']=='early' and step==1:
                    vision.wait(driver,lambda image:vision.require_text(image,(5,637,137,660),'SCOUT PATROL'),path,30)
                    if original.read(observer.vision,vision.Image.open(path)):raise ProtocolError('Tour remains after actual End control')
                    frame=capture(path);frames.append(frame);private.append(dict(image=path.name,**frame));break
                tag=vision.wait(driver,lambda image:topic(observer.vision,image,docs),path,30)
                frame=capture(path,tag);private.append(dict(image=path.name,**frame))
                if tag in contract.TOPICS:frames.append(frame)
                (directory/'all-pages.json').write_text(json.dumps(private,indent=2)+'\n')
                if case['input']['finish']=='early':
                    targets=[row for row in original.buttons(menu,vision.Image.open(path).convert('RGB')) if row['label']==declaration['controls']['end']]
                    if len(targets)!=1:raise ProtocolError('Actual declared End control is absent')
                    driver.click(targets[0]['x'],targets[0]['y'])
                else:driver.key('Enter')
                if tag=='TOUROVER':
                    path=directory/'map-restored.png'
                    vision.wait(driver,lambda image:vision.require_text(image,(5,637,137,660),'SCOUT PATROL'),path,30)
                    if original.read(observer.vision,vision.Image.open(path)):raise ProtocolError('Tour remains after actual Close')
                    frame=capture(path);frames.append(frame);private.append(dict(image=path.name,**frame));break
            else:raise ProtocolError('Synthetic interface tour did not terminate within bound')
            output=dict(frames=frames,completed=True,failure=None,units_unchanged=original.owned_units(driver)==initial_units)
            contract.validate_output(output,case)
            (directory/'all-pages.json').write_text(json.dumps(private,indent=2)+'\n')
            results.append(dict(id=case['id'],status='ok',output=output))
            print('Captured declared original tutorial '+case['id'],file=sys.stderr,flush=True)
        if fingerprint()!=initial:raise ProtocolError('Synthetic original observer changed during capture')
        metadata=dict(driver.metadata,adapter_sha256=initial,contract=contract.ALGORITHM,
            viewport=[1024,768],source_profiles={profile:inputs.source_sha256(profile) for profile in inputs.PROFILES},
            ocr_version=observer.vision.version,ocr_model_sha256=observer.vision.model_sha256,
            observation='Actual original input under declared own tutorial/label overrides; body topics/buttons/panels/heading read from screenshots, native turn and human unit fields read only',
            boundaries='Projected mandatory Tour controls under synthetic source profiles only. Prelude/world/terrain-dependent pages, geometry/font/arrows/animations/AI excluded; candidate native fixture context is explicitly separate from generated-world parity')
        write_response(metadata,results)
    finally:
        if driver:driver.close()
        observer.vision.close();vision.vision.close();menu.close()


if __name__=='__main__':
    try:main()
    except (OSError,ValueError,ProtocolError,original.VisionError) as error:
        print('Original synthetic interface tour failed: '+str(error),file=sys.stderr);sys.exit(1)
