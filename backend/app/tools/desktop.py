"""Desktop control — the assistant acting on the machine she runs on.

Two tiers:
  safe      → runs immediately (open a site, search, play a video)
  confirm   → needs an explicit confirmation from the user first
              (shutdown / restart / sleep / lock)

The confirm tier exists because a misheard word must never power off a
machine mid-work. Voice recognition is not reliable enough to be trusted with
an irreversible system action on its own.
"""

from __future__ import annotations

import platform
import re
import subprocess
import urllib.parse
import webbrowser

SAFE = "safe"
CONFIRM = "confirm"

# Only these commands can ever be spawned. No free-form shell — a transcript
# is untrusted input, and this keeps a misheard sentence from becoming one.
_POWER: dict[str, dict[str, list[str]]] = {
    "shutdown": {
        "Windows": ["shutdown", "/s", "/t", "20"],
        "Linux": ["shutdown", "-h", "+1"],
        "Darwin": ["osascript", "-e", 'tell app "System Events" to shut down'],
    },
    "restart": {
        "Windows": ["shutdown", "/r", "/t", "20"],
        "Linux": ["shutdown", "-r", "+1"],
        "Darwin": ["osascript", "-e", 'tell app "System Events" to restart'],
    },
    "sleep": {
        "Windows": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
        "Linux": ["systemctl", "suspend"],
        "Darwin": ["pmset", "sleepnow"],
    },
    "lock": {
        "Windows": ["rundll32.exe", "user32.dll,LockWorkStation"],
        "Linux": ["loginctl", "lock-session"],
        "Darwin": ["pmset", "displaysleepnow"],
    },
    "cancel_shutdown": {
        "Windows": ["shutdown", "/a"],
        "Linux": ["shutdown", "-c"],
        "Darwin": ["killall", "osascript"],
    },
}


# Same principle as _POWER: a fixed menu, never a free-form command line.
_APPS: dict[str, dict[str, list[str]]] = {
    "notepad": {"Windows": ["notepad.exe"], "Linux": ["gedit"], "Darwin": ["open", "-a", "TextEdit"]},
    "calculator": {"Windows": ["calc.exe"], "Linux": ["gnome-calculator"], "Darwin": ["open", "-a", "Calculator"]},
    "paint": {"Windows": ["mspaint.exe"], "Linux": ["gimp"], "Darwin": ["open", "-a", "Preview"]},
    "explorer": {"Windows": ["explorer.exe"], "Linux": ["nautilus"], "Darwin": ["open", "."]},
    "settings": {"Windows": ["cmd", "/c", "start", "ms-settings:"], "Linux": ["gnome-control-center"],
                 "Darwin": ["open", "-a", "System Settings"]},
    "task manager": {"Windows": ["taskmgr.exe"], "Linux": ["gnome-system-monitor"],
                     "Darwin": ["open", "-a", "Activity Monitor"]},
    "terminal": {"Windows": ["cmd.exe"], "Linux": ["gnome-terminal"], "Darwin": ["open", "-a", "Terminal"]},
    "powershell": {"Windows": ["powershell.exe"], "Linux": ["gnome-terminal"], "Darwin": ["open", "-a", "Terminal"]},
    "vs code": {"Windows": ["cmd", "/c", "code"], "Linux": ["code"], "Darwin": ["open", "-a", "Visual Studio Code"]},
    "camera": {"Windows": ["cmd", "/c", "start", "microsoft.windows.camera:"], "Linux": ["cheese"],
               "Darwin": ["open", "-a", "Photo Booth"]},
}

# Spoken variants that mean the same program.
_APP_ALIASES = {
    "calc": "calculator", "कैलकुलेटर": "calculator", "ক্যালকুলেটর": "calculator",
    "नोटपैड": "notepad", "নোটপ্যাড": "notepad",
    "file manager": "explorer", "files": "explorer",
    "command prompt": "terminal", "cmd": "terminal",
    "vscode": "vs code", "code": "vs code",
}


def open_url(url: str) -> dict:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    webbrowser.open(url)
    return {"ok": True, "opened": url}


def web_search(query: str) -> dict:
    return open_url("https://www.google.com/search?q=" + urllib.parse.quote(query))


def play_video(query: str) -> dict:
    """Opens YouTube results — the top hit is one click away."""
    return open_url("https://www.youtube.com/results?search_query=" + urllib.parse.quote(query))


def open_app(name: str) -> dict:
    key = _APP_ALIASES.get(name.strip().lower(), name.strip().lower())
    cmds = _APPS.get(key)
    if not cmds:
        return {"ok": False, "error": f"I don't know how to open {name}."}
    cmd = cmds.get(platform.system())
    if not cmd:
        return {"ok": False, "error": f"{key} is not available on {platform.system()}"}
    try:
        subprocess.Popen(cmd, shell=False)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "app": key}


def whatsapp(phone: str, message: str) -> dict:
    """Opens the chat with the message already typed.

    Deliberately stops one keypress short of sending: pressing Send for someone
    is theirs to do, and a misheard sentence must never leave the machine.
    """
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 10:
        return {"ok": False, "error": "That phone number doesn't look complete."}
    url = f"https://web.whatsapp.com/send?phone={digits}&text={urllib.parse.quote(message)}"
    webbrowser.open(url)
    return {"ok": True, "opened": url, "note": "Message is typed — press Enter to send."}


def volume(direction: str) -> dict:
    """Media keys via nircmd-free Windows API / OS tools."""
    system = platform.system()
    if system == "Windows":
        # ponytail: keybd_event through ctypes beats shipping a dependency for
        # three keystrokes. Swap for pycaw if per-app volume is ever needed.
        import ctypes

        codes = {"up": 0xAF, "down": 0xAE, "mute": 0xAD}
        code = codes.get(direction)
        if not code:
            return {"ok": False, "error": f"Unknown volume direction: {direction}"}
        repeats = 1 if direction == "mute" else 5  # one press is barely audible
        for _ in range(repeats):
            ctypes.windll.user32.keybd_event(code, 0, 0, 0)
            ctypes.windll.user32.keybd_event(code, 0, 2, 0)
        return {"ok": True, "volume": direction}

    cmds = {
        "Linux": {"up": ["amixer", "-q", "sset", "Master", "10%+"],
                  "down": ["amixer", "-q", "sset", "Master", "10%-"],
                  "mute": ["amixer", "-q", "sset", "Master", "toggle"]},
        "Darwin": {"up": ["osascript", "-e", "set volume output volume (output volume of (get volume settings) + 10)"],
                   "down": ["osascript", "-e", "set volume output volume (output volume of (get volume settings) - 10)"],
                   "mute": ["osascript", "-e", "set volume with output muted"]},
    }.get(system, {})
    cmd = cmds.get(direction)
    if not cmd:
        return {"ok": False, "error": f"Volume control is not wired up on {system}."}
    try:
        subprocess.Popen(cmd, shell=False)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "volume": direction}


def power(action: str) -> dict:
    cmds = _POWER.get(action)
    if not cmds:
        return {"ok": False, "error": f"Unknown power action: {action}"}
    cmd = cmds.get(platform.system())
    if not cmd:
        return {"ok": False, "error": f"{action} is not supported on {platform.system()}"}
    try:
        subprocess.Popen(cmd, shell=False)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    # Shutdown/restart are scheduled with a delay so "cancel" is still possible.
    grace = action in ("shutdown", "restart")
    return {"ok": True, "action": action, "cancellable": grace}
