"""Apply declared PRNG fixture inputs to the owned original GUI thread."""
import ctypes as c
from ctypes import wintypes as w
import json,struct,sys
from pathlib import Path
out=Path(sys.argv[1]);seed=int(sys.argv[2]);assert 0<=seed<=0xffffffff
k=c.WinDLL('kernel32',use_last_error=True);u=c.WinDLL('user32',use_last_error=True);n=c.WinDLL('ntdll')
CALLBACK=c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
u.EnumWindows.argtypes=[CALLBACK,w.LPARAM];u.EnumWindows.restype=w.BOOL
u.IsWindowVisible.argtypes=[w.HWND];u.IsWindowVisible.restype=w.BOOL
u.GetClientRect.argtypes=[w.HWND,c.POINTER(w.RECT)];u.GetClientRect.restype=w.BOOL
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)];u.GetWindowThreadProcessId.restype=w.DWORD
k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
k.OpenThread.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenThread.restype=w.HANDLE
k.ReadProcessMemory.argtypes=[w.HANDLE,c.c_void_p,c.c_void_p,c.c_size_t,c.POINTER(c.c_size_t)];k.ReadProcessMemory.restype=w.BOOL
k.WriteProcessMemory.argtypes=[w.HANDLE,c.c_void_p,c.c_void_p,c.c_size_t,c.POINTER(c.c_size_t)];k.WriteProcessMemory.restype=w.BOOL
k.CloseHandle.argtypes=[w.HANDLE];k.CloseHandle.restype=w.BOOL
class TBI(c.Structure):_fields_=[('exit',c.c_long),('teb',c.c_void_p),('pid',c.c_void_p),('tid',c.c_void_p),('affinity',c.c_size_t),('priority',c.c_long),('base_priority',c.c_long)]
n.NtQueryInformationThread.argtypes=[w.HANDLE,w.DWORD,c.c_void_p,w.ULONG,c.POINTER(w.ULONG)];n.NtQueryInformationThread.restype=c.c_long
windows=[]
@CALLBACK
def visit(hwnd,arg):
 rect=w.RECT();pid=w.DWORD()
 if u.IsWindowVisible(hwnd) and u.GetClientRect(hwnd,c.byref(rect)) and (rect.right,rect.bottom)==(1024,768):
  tid=u.GetWindowThreadProcessId(hwnd,c.byref(pid));windows.append((pid.value,tid))
 return True
process=thread=None
try:
 assert u.EnumWindows(visit,0) and len(windows)==1,windows
 pid,tid=windows[0];process=k.OpenProcess(0x438,False,pid);thread=k.OpenThread(0x40,False,tid)
 if not process or not thread:raise c.WinError(c.get_last_error())
 def read(addr,size):
  data=c.create_string_buffer(size);got=c.c_size_t()
  if not k.ReadProcessMemory(process,addr,data,size,c.byref(got)) or got.value!=size:raise c.WinError(c.get_last_error())
  return data.raw
 def word(addr):return struct.unpack('<I',read(addr,4))[0]
 info=TBI();length=w.ULONG();status=n.NtQueryInformationThread(thread,0,c.byref(info),c.sizeof(info),c.byref(length))
 if status or info.tid!=tid or info.pid!=pid:raise RuntimeError('unrecognized GUI thread identity')
 valid=[]
 for teb in [info.teb,info.teb+0x2000,info.teb-0x2000]:
  try:
   if word(teb+0x18)==teb and word(teb+0x20)==pid and word(teb+0x24)==tid:valid.append(teb)
  except OSError:pass
 if len(valid)!=1:raise RuntimeError('unrecognized 32-bit GUI TEB')
 index=word(0x006A6180)
 if not 0<=index<64:raise RuntimeError('unbounded original CRT TLS index')
 ptd=word(valid[0]+0xe10+4*index)
 if word(ptd)!=tid:raise RuntimeError('unrecognized original CRT thread identity')
 prior={'crt':word(ptd+0x14),'game':word(0x009BB568)}
 for addr in [ptd+0x14,0x009BB568]:
  value=c.c_uint32(seed);got=c.c_size_t()
  if not k.WriteProcessMemory(process,addr,c.byref(value),4,c.byref(got)) or got.value!=4 or word(addr)!=seed:raise RuntimeError('seed write/readback failed')
 out.write_text(json.dumps(dict(ok=True,seed=seed,prior=prior,readback={'crt':word(ptd+0x14),'game':word(0x009BB568)}))+'\n')
except BaseException as error:
 out.write_text(json.dumps(dict(ok=False,error=repr(error)))+'\n');raise
finally:
 if process:k.CloseHandle(process)
 if thread:k.CloseHandle(thread)
