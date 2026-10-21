"""Send one ordinary Windows mouse message sequence to the actual game window."""
import ctypes as c
from ctypes import wintypes as w
import json,sys,time
from pathlib import Path

out=Path(sys.argv[1]); key_mode=sys.argv[2]=='key'
if key_mode:
    if sys.argv[3:]!=['Tab']:raise ValueError('Only the declared Tab key is supported')
else:
    x,y=map(int,sys.argv[2:]); assert 0<=x<1024 and 0<=y<768
u=c.WinDLL('user32',use_last_error=True); k=c.WinDLL('kernel32',use_last_error=True)
CALLBACK=c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
u.EnumWindows.argtypes=[CALLBACK,w.LPARAM];u.EnumWindows.restype=w.BOOL
u.IsWindowVisible.argtypes=[w.HWND];u.IsWindowVisible.restype=w.BOOL
u.GetClientRect.argtypes=[w.HWND,c.POINTER(w.RECT)];u.GetClientRect.restype=w.BOOL
u.ClientToScreen.argtypes=[w.HWND,c.POINTER(w.POINT)];u.ClientToScreen.restype=w.BOOL
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)];u.GetWindowThreadProcessId.restype=w.DWORD
u.GetWindowTextW.argtypes=[w.HWND,w.LPWSTR,c.c_int];u.GetWindowTextW.restype=c.c_int
u.MapVirtualKeyW.argtypes=[w.UINT,w.UINT];u.MapVirtualKeyW.restype=w.UINT
u.SetForegroundWindow.argtypes=[w.HWND];u.SetForegroundWindow.restype=w.BOOL
u.SetCursorPos.argtypes=[c.c_int,c.c_int];u.SetCursorPos.restype=w.BOOL
u.PostMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM];u.PostMessageW.restype=w.BOOL
windows=[]
@CALLBACK
def visit(hwnd,arg):
    rect=w.RECT(); point=w.POINT(); pid=w.DWORD()
    if u.IsWindowVisible(hwnd) and u.GetClientRect(hwnd,c.byref(rect)) and (rect.right,rect.bottom)==(1024,768):
        assert u.ClientToScreen(hwnd,c.byref(point))
        u.GetWindowThreadProcessId(hwnd,c.byref(pid))
        if pid.value!=k.GetCurrentProcessId():
            title=c.create_unicode_buffer(512);u.GetWindowTextW(hwnd,title,len(title))
            windows.append(dict(hwnd=int(hwnd),pid=pid.value,title=title.value,origin=[point.x,point.y]))
    return True
try:
    assert u.EnumWindows(visit,0)
    if len(windows)!=1: raise RuntimeError('Expected one actual 1024x768 game client: '+repr(windows))
    target=windows[0]; hwnd=target['hwnd']; sx,sy=target['origin']
    if (sx,sy)!=(0,0):raise RuntimeError('Unexpected game-client origin')
    u.SetForegroundWindow(hwnd)
    sent=[]
    if key_mode:
        scan=u.MapVirtualKeyW(9,0)
        if not scan:raise c.WinError(c.get_last_error())
        for message,flags in [(0x100,0),(0x101,0xc0000000)]:
            if not u.PostMessageW(hwnd,message,9,1|(scan<<16)|flags):raise c.WinError(c.get_last_error())
            sent.append(message)
            time.sleep(.18)
        data=dict(key='Tab')
    else:
        if not u.SetCursorPos(x,y):raise c.WinError(c.get_last_error())
        for message,buttons in [(0x200,0),(0x201,1),(0x202,0)]:
            if not u.PostMessageW(hwnd,message,buttons,(y<<16)|x):raise c.WinError(c.get_last_error())
            sent.append(message)
        data=dict(point=[x,y])
    out.write_text(json.dumps(dict(ok=True,target=target,messages=sent,**data)))
except BaseException as error:
    out.write_text(json.dumps(dict(ok=False,error=type(error).__name__+': '+str(error))))
    raise
