#include <windows.h>
#include <string.h>
static HWND target;
static BOOL CALLBACK find_game(HWND hwnd, LPARAM unused) {
    char title[256];
    (void)unused;
    GetWindowTextA(hwnd, title, sizeof title);
    if (strstr(title, "Sid Meier")) { target=hwnd; return FALSE; }
    return TRUE;
}
int WINAPI WinMain(HINSTANCE a, HINSTANCE b, LPSTR c, int d) {
    INPUT key;
    (void)a; (void)b; (void)c; (void)d;
    EnumWindows(find_game, 0);
    if (!target) return 3;
    SetForegroundWindow(target);
    Sleep(250);
    memset(&key, 0, sizeof key);
    key.type=INPUT_KEYBOARD;
    key.ki.wVk=VK_F2;
    key.ki.wScan=(WORD)MapVirtualKeyA(VK_F2, MAPVK_VK_TO_VSC);
    if (SendInput(1, &key, sizeof key)!=1) return 4;
    Sleep(350);
    key.ki.dwFlags=KEYEVENTF_KEYUP;
    if (SendInput(1, &key, sizeof key)!=1) return 5;
    return 0;
}
