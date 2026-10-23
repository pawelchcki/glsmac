"""Identify installed pod frames from actual rendered pixels, without game-state labels."""
from pathlib import Path
from PIL import Image
from protocol import ProtocolError

def templates(path, samples):
    source=Image.open(path); result={}
    for frame in samples:
        source.seek(frame); image=source.convert('RGB'); pixels=image.load(); anchors=[]
        for y in range(0,image.height,4):
            for x in range(0,image.width-8,4):
                line=[pixels[x+n,y] for n in range(8)]
                if all(p!=(255,0,255) and max(p)<236 for p in line) and len(set(line))>5:
                    anchors.append((x,y,bytes(c for p in line for c in p)))
        selected=anchors[::max(1,len(anchors)//25)][:25]
        if len(selected)<3: raise ProtocolError('Installed pod frame lacks independent pixel anchors')
        result[frame]=selected
    return result

def locate(image, anchors):
    image=image.convert('RGB');data=image.tobytes();origins={}
    for x,y,needle in anchors:
        start=0
        while True:
            position=data.find(needle,start)
            if position<0:break
            start=position+1
            if position%3:continue
            pixel=position//3;origin=(pixel%image.width-x,pixel//image.width-y)
            origins[origin]=origins.get(origin,0)+1
    found=[origin for origin,count in origins.items() if count>=3]
    if len(found)>1:raise ProtocolError('Ambiguous rendered pod frame translation')
    return found[0] if found else None

def inspect_sequence(directory, assets, samples, with_positions=False):
    pending=templates(Path(assets)/'drop_pod.flc',samples);found={};order=[];positions=[]
    for capture_index,path in enumerate(sorted(Path(directory).glob('video-*.png'))):
        image=Image.open(path)
        for index,anchors in list(pending.items()):
            origin=locate(image,anchors)
            if origin is not None:
                found[index]=origin;order.append(index);positions.append(capture_index);del pending[index]
        if not pending:break
    if pending:raise ProtocolError('Actual landing did not display declared asset frames: '+str(sorted(pending)))
    if order!=list(samples):raise ProtocolError('Actual pod frames did not appear in declared order')
    first=found[samples[0]]
    frames=[dict(index=index,dx=found[index][0]-first[0],dy=found[index][1]-first[1]) for index in samples]
    return (frames,positions) if with_positions else frames
