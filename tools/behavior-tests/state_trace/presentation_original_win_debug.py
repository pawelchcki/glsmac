"""Original-only continuous raw UI observer using Windows debug events.

Hardware contexts observe original instructions without patching them. Raw
constructor/destructor/watch hits are diagnostics, not semantic UI coverage."""
import ctypes as c
from ctypes import wintypes as w
import argparse,hashlib,json,sys,time
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('executable');parser.add_argument('events');parser.add_argument('--max-events',type=int,default=250000)
args=parser.parse_args();exe=args.executable;output=args.events
if not 1<=args.max_events<=2000000:raise ValueError('event bound must be1..2000000')
image=Path(exe)
if image.stat().st_size!=3084288 or hashlib.sha256(image.read_bytes()).hexdigest()!='01901cbf7196b0c5d0df9540a029520f5df8fd9a6b343deef8b5663872805fcf':raise ValueError('unsupported original executable fingerprint')
log=Path(output).open('w',buffering=1);seq=0;overflow=False
k=c.WinDLL('kernel32',use_last_error=True)
class STARTUPINFO(c.Structure):
 _fields_=[('cb',w.DWORD),('reserved',w.LPWSTR),('desktop',w.LPWSTR),('title',w.LPWSTR),('x',w.DWORD),('y',w.DWORD),('xsize',w.DWORD),('ysize',w.DWORD),('xchars',w.DWORD),('ychars',w.DWORD),('fill',w.DWORD),('flags',w.DWORD),('show',w.WORD),('reserved_size',w.WORD),('reserved_bytes',c.c_void_p),('stdin',w.HANDLE),('stdout',w.HANDLE),('stderr',w.HANDLE)]
class PROCESSINFO(c.Structure):_fields_=[('process',w.HANDLE),('thread',w.HANDLE),('pid',w.DWORD),('tid',w.DWORD)]
class FLOATSAVE(c.Structure):_fields_=[(n,w.DWORD) for n in ['control','status','tag','error_offset','error_selector','data_offset','data_selector']]+[('registers',c.c_ubyte*80),('npx',w.DWORD)]
class CONTEXT32(c.Structure):
 _fields_=[(n,w.DWORD) for n in ['flags','Dr0','Dr1','Dr2','Dr3','Dr6','Dr7']]+[('float_save',FLOATSAVE)]+[(n,w.DWORD) for n in ['SegGs','SegFs','SegEs','SegDs','Edi','Esi','Ebx','Edx','Ecx','Eax','Ebp','Eip','SegCs','EFlags','Esp','SegSs']]+[('extended',c.c_ubyte*512)]
class EXREC(c.Structure):_fields_=[('code',w.DWORD),('flags',w.DWORD),('record',c.c_void_p),('address',c.c_void_p),('count',w.DWORD),('information',c.c_size_t*15)]
class EXINFO(c.Structure):_fields_=[('record',EXREC),('first',w.DWORD)]
class CREATEPROC(c.Structure):_fields_=[('file',w.HANDLE),('process',w.HANDLE),('thread',w.HANDLE),('base',c.c_void_p),('debug_offset',w.DWORD),('debug_size',w.DWORD),('tls',c.c_void_p),('start',c.c_void_p),('image',c.c_void_p),('unicode',w.WORD)]
class CREATETHREAD(c.Structure):_fields_=[('thread',w.HANDLE),('tls',c.c_void_p),('start',c.c_void_p)]
class EXITINFO(c.Structure):_fields_=[('code',w.DWORD)]
class LOADINFO(c.Structure):_fields_=[('file',w.HANDLE),('base',c.c_void_p),('offset',w.DWORD),('size',w.DWORD),('name',c.c_void_p),('unicode',w.WORD)]
class DEBUGSTRING(c.Structure):_fields_=[('data',c.c_void_p),('unicode',w.WORD),('length',w.WORD)]
class EVENTDATA(c.Union):_fields_=[('exception',EXINFO),('create_process',CREATEPROC),('create_thread',CREATETHREAD),('exit_process',EXITINFO),('load',LOADINFO),('string',DEBUGSTRING),('padding',c.c_byte*160)]
class DEBUGEVENT(c.Structure):_fields_=[('code',w.DWORD),('pid',w.DWORD),('tid',w.DWORD),('data',EVENTDATA)]
assert c.sizeof(CONTEXT32)==716 and c.sizeof(DEBUGEVENT)==176,(c.sizeof(CONTEXT32),c.sizeof(DEBUGEVENT))
k.CreateProcessW.argtypes=[w.LPCWSTR,w.LPWSTR,c.c_void_p,c.c_void_p,w.BOOL,w.DWORD,c.c_void_p,w.LPCWSTR,c.POINTER(STARTUPINFO),c.POINTER(PROCESSINFO)];k.CreateProcessW.restype=w.BOOL
k.WaitForDebugEvent.argtypes=[c.POINTER(DEBUGEVENT),w.DWORD];k.WaitForDebugEvent.restype=w.BOOL
k.ContinueDebugEvent.argtypes=[w.DWORD,w.DWORD,w.DWORD];k.ContinueDebugEvent.restype=w.BOOL
k.Wow64GetThreadContext.argtypes=[w.HANDLE,c.POINTER(CONTEXT32)];k.Wow64GetThreadContext.restype=w.BOOL
k.Wow64SetThreadContext.argtypes=[w.HANDLE,c.POINTER(CONTEXT32)];k.Wow64SetThreadContext.restype=w.BOOL
k.ReadProcessMemory.argtypes=[w.HANDLE,c.c_void_p,c.c_void_p,c.c_size_t,c.POINTER(c.c_size_t)];k.ReadProcessMemory.restype=w.BOOL
k.CloseHandle.argtypes=[w.HANDLE];k.CloseHandle.restype=w.BOOL
threads={};process=None

def emit(kind,**fields):
 global seq,overflow
 seq+=1
 if seq>args.max_events:
  if not overflow:
   overflow=True;log.write(json.dumps(dict(seq=seq,observed_ns=time.monotonic_ns(),kind='overflow',dropped_events_at_least=1))+'\n')
  return
 log.write(json.dumps(dict(seq=seq,observed_ns=time.monotonic_ns(),kind=kind,**fields))+'\n')
def word(address):
 value=c.c_uint32();got=c.c_size_t()
 if not k.ReadProcessMemory(process,address,c.byref(value),4,c.byref(got)) or got.value!=4:raise c.WinError(c.get_last_error())
 return value.value
def getctx(handle):
 ctx=CONTEXT32();ctx.flags=0x10017
 if not k.Wow64GetThreadContext(handle,c.byref(ctx)):raise c.WinError(c.get_last_error())
 return ctx
def arm(handle,tid):
 try:
  ctx=getctx(handle);ctx.Dr0=0x005EB3D0;ctx.Dr1=0x005EBC90;ctx.Dr2=0x009B663C;ctx.Dr3=0x009B7AE4;ctx.Dr6=0;ctx.Dr7=0xDD000055
  if not k.Wow64SetThreadContext(handle,c.byref(ctx)):raise c.WinError(c.get_last_error())
  readback=getctx(handle)
  emit('hardware-armed',tid=tid,readback_valid=(readback.Dr0,readback.Dr1,readback.Dr2,readback.Dr3,readback.Dr7)==(ctx.Dr0,ctx.Dr1,ctx.Dr2,ctx.Dr3,ctx.Dr7))
 except OSError as error:emit('hardware-arm-error',tid=tid,error=str(error))
try:
 emit('recorder-armed',instruction_patches=False)
 si=STARTUPINFO();si.cb=c.sizeof(si);pi=PROCESSINFO()
 if not k.CreateProcessW(exe,None,None,None,False,2,None,str(Path(exe).parent),c.byref(si),c.byref(pi)):raise c.WinError(c.get_last_error())
 process=pi.process;threads[pi.tid]=pi.thread;emit('created-debuggee',pid=pi.pid,tid=pi.tid)
 while True:
  event=DEBUGEVENT()
  if not k.WaitForDebugEvent(c.byref(event),1000):
   if c.get_last_error()==121:continue
   raise c.WinError(c.get_last_error())
  code=event.code;status=0x10002
  if code==3:
   threads[event.tid]=event.data.create_process.thread;arm(threads[event.tid],event.tid)
   if event.data.create_process.file:k.CloseHandle(event.data.create_process.file)
  elif code==2:threads[event.tid]=event.data.create_thread.thread;arm(threads[event.tid],event.tid)
  elif code==6:
   if event.data.load.file:k.CloseHandle(event.data.load.file)
  elif code==1:
   exception=event.data.exception.record.code
   if exception==0x80000004:
    ctx=getctx(threads[event.tid]);bits=ctx.Dr6&15
    if bits&1:emit('native-widget-constructor-entry',native_object=ctx.Ecx)
    if bits&2:emit('native-widget-destructor-entry',native_object=ctx.Ecx)
    if bits&4:emit('native-focus-change',value=word(0x009B663C))
    if bits&8:emit('native-modal-change',value=word(0x009B7AE4))
    if not bits:emit('native-single-step-other',eip=ctx.Eip)
    ctx.Dr6=0;ctx.EFlags|=0x10000
    if not k.Wow64SetThreadContext(threads[event.tid],c.byref(ctx)):raise c.WinError(c.get_last_error())
   elif exception!=0x80000003:status=0x80010001
  elif code==5:
   emit('debuggee-exit',exit_code=event.data.exit_process.code);k.ContinueDebugEvent(event.pid,event.tid,status);break
  if not k.ContinueDebugEvent(event.pid,event.tid,status):raise c.WinError(c.get_last_error())
except BaseException as error:
 emit('observer-error',error=repr(error));raise
finally:log.close()
