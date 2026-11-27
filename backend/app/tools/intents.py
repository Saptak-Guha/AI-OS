"""Turn a spoken sentence into an action — English, Hindi and Bengali.

ponytail: keyword router, not the LLM. Voice commands are formulaic in every
language ("open youtube", "यूट्यूब खोलो", "ইউটিউব খোলো") and patterns never
hallucinate a shutdown the way a small model does. Swap for native tool calling
once a big model is in the loop.

Reply language follows the *script* the user typed or spoke. Devanagari in,
Devanagari out. Romanised Hindi ("youtube kholo") gets an English reply,
because a hi-IN voice reading Latin letters sounds worse than an English one.
"""

from __future__ import annotations

import re

# --- language detection -----------------------------------------------------

_SCRIPTS = [("hi", re.compile(r"[ऀ-ॿ]")), ("bn", re.compile(r"[ঀ-৿]"))]

# Recognition locales, in the order the browser should try them.
LOCALES = {"en": "en-IN", "hi": "hi-IN", "bn": "bn-IN"}


def language_of(text: str) -> str:
    for code, pattern in _SCRIPTS:
        if pattern.search(text):
            return code
    return "en"


# A "word" character, Indic included. Python's \w excludes combining marks
# (Mn), so [\w]+ splits यूट्यूब at every vowel sign — the ranges add them back.
_W = r"[\w.\-ऀ-ॿঀ-৿]"

# --- verb vocabulary --------------------------------------------------------
# Each group is every way the three languages say one verb, including the
# romanised spellings people actually type.

_OPEN = r"open|launch|start|खोलो|खोल|खोलिए|चालू\s*कर(?:ो|ें)?|খোল(?:ো)?|চালু\s*কর|kholo|khol\s*do|cholao"
_PLAY = r"play|बजाओ|बजा|चलाओ|चला|सुनाओ|সুনাও|চালাও|শোনাও|bajao|chalao|sunao"
_SEARCH = r"search|google|look\s*up|find|खोजो|ढूंढो|ढूँढो|सर्च|সার্চ|খোঁজ|খুঁজ|khojo|dhundho"
_SEND = r"send|message|msg|text|भेजो|भेज|मैसेज|সেন্ড|পাঠাও|মেসেজ|bhejo|bhej|pathao"
_STOP = r"stop|pause|रोको|रुको|बंद|থাম|বন্ধ|roko|band\s*karo"

# --- rules ------------------------------------------------------------------
# Matched in order, first hit wins, so the specific patterns come first.

_RULES: list[tuple[str, str, str]] = [
    # Cancelling a scheduled shutdown must outrank the shutdown rule itself.
    ("cancel_shutdown", "safe",
     rf"\b(cancel|abort|{_STOP})\b.*\b(shut\s?down|restart|reboot|शटडाउन|बंद|শাটডাউন)\b"),

    # WhatsApp: "message Rahul saying I'm late", "रोहन को मैसेज भेजो कि ..."
    ("whatsapp", "confirm",
     rf"\b(whatsapp|व्हाट्सएप|व्हाट्सऐप|হোয়াটসঅ্যাপ)\b|(?:{_SEND})\b.*\b(?:whatsapp|message|मैसेज|মেসেজ)\b"),

    ("shutdown", "confirm",
     r"\b(shut\s?down|power\s*off|turn\s*off)\b|शट\s*डाउन|बंद\s*कर\s*(दो|दीजिए)|শাটডাউন|বন্ধ\s*কর"),
    ("restart", "confirm",
     r"\b(restart|reboot)\b|रीस्टार्ट|फिर\s*से\s*चालू|রিস্টার্ট|আবার\s*চালু"),
    ("sleep", "confirm",
     r"\b(sleep|suspend|hibernate)\b|स्लीप|सुला\s*दो|স্লিপ|ঘুম\s*পাড়"),
    ("lock", "confirm",
     r"\block\b.*\b(laptop|computer|pc|screen|system)\b|लॉक\s*कर|লক\s*কর"),

    # Media control on whatever is playing in the site's own player.
    ("media_stop", "safe", rf"\b({_STOP})\b.*\b(video|song|music|गाना|वीडियो|গান|ভিডিও)\b"),
    ("volume", "safe",
     r"\b(?:volume|sound|आवाज़|आवाज|awaaz|ভলিউম|আওয়াজ)\b.*?"
     r"(?P<q>up|down|mute|बढ़ा|कम|म्यूट|বাড়া|কমা|মিউট)"),
    # "mute" on its own is unambiguous, and it comes before the noun.
    ("volume", "safe", r"\b(?P<q>mute|म्यूट|মিউট)\b"),

    ("time", "safe",
     r"\b(what(?:'s| is) the time|time now|कितने\s*बजे|समय\s*क्या|কটা\s*বাজে|সময়\s*কত)\b"),

    # Desktop programs, before open_site — "open notepad" is not a website.
    ("open_app", "safe", rf"\b(?:{_OPEN})\s+(?P<q>notepad|calculator|calc|paint|explorer|file\s*manager|"
                         r"settings|task\s*manager|terminal|command\s*prompt|cmd|powershell|"
                         r"vs\s*code|vscode|code|word|excel|spotify\s*app|camera|"
                         r"नोटपैड|कैलकुलेटर|নোটপ্যাড|ক্যালকুলেটর)\b"),
    ("open_app", "safe", rf"\b(?P<q>notepad|calculator|calc|paint|task\s*manager|vs\s*code|vscode|"
                         rf"नोटपैड|कैलकुलेटर|নোটপ্যাড|ক্যালকুলেটর)\s+(?:{_OPEN})\b"),

    # Websites, before play_video — "open youtube" means the site, while
    # "open a funny video" falls through because "video" is not a site.
    ("open_site", "safe", rf"\b(?:{_OPEN})\s+(?P<q>{_W}+)"),
    # Hindi and Bengali put the object first: "यूट्यूब खोलो" is *youtube open*.
    ("open_site", "safe", rf"(?P<q>{_W}+)\s+(?:{_OPEN})"),

    ("play_video", "safe",
     rf"\b(?:{_PLAY})\b.*\b(video|song|music|movie|youtube|गाना|गीत|वीडियो|यूट्यूब|গান|ভিডিও|ইউটিউব)\b"
     rf"|\b(?:{_PLAY})\b\s+(?P<q>.+)"),
    ("play_video", "safe",
     rf"(video|song|music|movie|गाना|गीत|वीडियो|গান|ভিডিও)\s+(?:{_PLAY})\b"),

    ("cheer_up", "safe",
     r"\b(bored|boring|sad|lonely|stressed|depressed|cheer\s*me|make\s*me\s*(laugh|happy|smile)|"
     r"feel(?:ing)?\s*(down|low|bad))\b"
     r"|बोर\s*हो|उदास|मन\s*नहीं\s*लग|अकेला|বোর\s*লাগ|মন\s*খারাপ|একা\s*লাগ"),

    ("search", "safe", rf"\b(?:{_SEARCH})\b\s*(?:for\s+)?(?P<q>.+)"),

    # Last rule on purpose: real *work*, handed to the agent workforce instead
    # of answered in one breath. Everything above is a device command; anything
    # that isn't a job at all falls past this into ordinary conversation.
    ("delegate", "safe",
     r"\b(?:research|write|draft|prepare|create|build|design|plan|analyse|analyze|"
     r"summarise|summarize|compare|review|report\s+on|put\s+together|work\s+out|figure\s+out)\b"
     r"\s+(?P<q>.{6,})"
     r"|(?P<q2>.{6,}?)\s*(?:बनाओ|बना दो|लिखो|लिख दो|तैयार करो|रिसर्च करो|"
     r"বানাও|লেখো|লিখে দাও|তৈরি করো|রিসার্চ করো)"),
]

# Words that add nothing to a query and confuse a search engine.
_STOPWORDS = re.compile(
    r"\b(please|could you|can you|would you|for me|on (youtube|google)|a|an|the|some|"
    r"video|videos|कृपया|ज़रा|जरा|एक|के लिए|দয়া করে|একটু|একটা)\b",
    re.I,
)

# Every way the three languages say louder / quieter / silent.
_VOLUME = {
    "up": "up", "बढ़ा": "up", "বাড়া": "up",
    "down": "down", "कम": "down", "কমা": "down",
    "mute": "mute", "म्यूट": "mute", "মিউট": "mute",
}

# Bare words a browser cannot resolve — "open browser" means a homepage.
_SITES = {
    "browser": "https://www.google.com",
    "google": "https://www.google.com",
    "youtube": "https://www.youtube.com",
    "यूट्यूब": "https://www.youtube.com",
    "ইউটিউব": "https://www.youtube.com",
    "gmail": "https://mail.google.com",
    "mail": "https://mail.google.com",
    "maps": "https://maps.google.com",
    "github": "https://github.com",
    "chatgpt": "https://chat.openai.com",
    "whatsapp": "https://web.whatsapp.com",
    "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com",
    "twitter": "https://twitter.com",
    "x": "https://twitter.com",
    "spotify": "https://open.spotify.com",
    "netflix": "https://www.netflix.com",
    "prime": "https://www.primevideo.com",
    "hotstar": "https://www.hotstar.com",
    "linkedin": "https://www.linkedin.com",
    "reddit": "https://www.reddit.com",
    "wikipedia": "https://www.wikipedia.org",
    "amazon": "https://www.amazon.in",
    "flipkart": "https://www.flipkart.com",
    "drive": "https://drive.google.com",
    "calendar": "https://calendar.google.com",
}

# What she says back, per language. `{q}` is the query.
_LINES: dict[str, dict[str, str]] = {
    "open_site": {
        "en": "Opening {q}.",
        "hi": "{q} खोल रही हूँ।",
        "bn": "{q} খুলছি।",
    },
    "open_app": {
        "en": "Opening {q}.",
        "hi": "{q} खोल रही हूँ।",
        "bn": "{q} খুলছি।",
    },
    "search": {
        "en": "Searching for {q}.",
        "hi": "{q} खोज रही हूँ।",
        "bn": "{q} খুঁজছি।",
    },
    "play_video": {
        "en": "Playing {q} for you.",
        "hi": "{q} चला रही हूँ।",
        "bn": "{q} চালাচ্ছি।",
    },
    "cheer_up": {
        "en": "Hey, that sounds rough. Let me put something funny on for you.",
        "hi": "अरे, मुश्किल लग रहा है। मैं कुछ मज़ेदार लगाती हूँ आपके लिए।",
        "bn": "আহা, কঠিন শোনাচ্ছে। আমি মজার কিছু চালিয়ে দিচ্ছি।",
    },
    "media_stop": {"en": "Stopped.", "hi": "रोक दिया।", "bn": "থামিয়ে দিলাম।"},
    "volume": {"en": "Done.", "hi": "हो गया।", "bn": "হয়ে গেছে।"},
    "shutdown": {
        "en": "You want me to shut down the laptop? Confirm and I'll do it.",
        "hi": "क्या मैं लैपटॉप बंद कर दूँ? कहिए तो कर देती हूँ।",
        "bn": "আমি কি ল্যাপটপ বন্ধ করে দেব? বললে করে দিচ্ছি।",
    },
    "restart": {
        "en": "Restart the machine? Confirm and I'll do it.",
        "hi": "मशीन रीस्टार्ट कर दूँ? कहिए तो कर देती हूँ।",
        "bn": "মেশিন রিস্টার্ট করব? বললে করে দিচ্ছি।",
    },
    "sleep": {
        "en": "Put the computer to sleep? Confirm and I'll do it.",
        "hi": "कंप्यूटर को स्लीप में डाल दूँ? कहिए तो कर देती हूँ।",
        "bn": "কম্পিউটার স্লিপে দেব? বললে করে দিচ্ছি।",
    },
    "lock": {
        "en": "Lock the screen? Confirm and I'll do it.",
        "hi": "स्क्रीन लॉक कर दूँ? कहिए तो कर देती हूँ।",
        "bn": "স্ক্রিন লক করব? বললে করে দিচ্ছি।",
    },
    "cancel_shutdown": {
        "en": "Cancelling the shutdown.",
        "hi": "शटडाउन रद्द कर रही हूँ।",
        "bn": "শাটডাউন বাতিল করছি।",
    },
    "whatsapp": {
        "en": "Send “{msg}” to {who} on WhatsApp? Confirm and I'll open the chat.",
        "hi": "{who} को व्हाट्सएप पर “{msg}” भेजूँ? कहिए तो चैट खोल देती हूँ।",
        "bn": "{who}-কে হোয়াটসঅ্যাপে “{msg}” পাঠাব? বললে চ্যাট খুলে দিচ্ছি।",
    },
    "delegate": {
        "en": "On it. Putting the team on this — I'll tell you as they go.",
        "hi": "ठीक है, टीम को लगा रही हूँ। साथ-साथ बताती रहूँगी।",
        "bn": "ঠিক আছে, টিমকে লাগিয়ে দিচ্ছি। এগোনোর সাথে সাথে বলব।",
    },
    "time": {"en": "", "hi": "", "bn": ""},  # filled by the caller — it needs a clock
}


def detect(text: str) -> dict | None:
    """Return an action dict, or None when the sentence is just conversation.

    Keys: intent, tier, query, speak, lang (+ who/message for whatsapp).
    """
    raw = text.strip()
    if not raw:
        return None
    t = raw.lower()
    lang = language_of(raw)

    for intent, tier, pattern in _RULES:
        m = re.search(pattern, t, re.I)
        if not m:
            continue
        groups = m.groupdict()
        query = _clean(groups.get("q") or groups.get("q2") or "")

        if intent == "whatsapp":
            parsed = _whatsapp(raw)
            if not parsed:
                continue  # they said "whatsapp" without a message — let her chat
            return _make(intent, tier, parsed["message"], lang, **parsed)

        if intent == "open_app":
            return _make(intent, tier, query, lang)

        if intent == "volume":
            return _make(intent, tier, _VOLUME.get(query, "up"), lang)

        if intent == "open_site":
            target = _SITES.get(query)
            if not target and "." not in query:
                continue  # "open the window" is talk, not a command
            return _make(intent, tier, target or query, lang, label=query)

        if intent == "play_video":
            topic = query or _topic(raw) or "relaxing music"
            return _make(intent, tier, topic, lang)

        if intent == "search":
            if not query:
                continue
            return _make(intent, tier, query, lang)

        if intent == "delegate":
            if not query:
                continue
            # The whole sentence is the objective — the workforce classifies it
            # itself, and trimming it to the matched tail loses the constraints.
            return _make(intent, tier, raw, lang)

        return _make(intent, tier, query, lang)

    return None


# --- helpers ----------------------------------------------------------------

def _make(intent: str, tier: str, query: str, lang: str, label: str = "", **extra) -> dict:
    line = _LINES.get(intent, {}).get(lang) or _LINES.get(intent, {}).get("en", "")
    speak = line.format(q=label or query, msg=extra.get("message", ""), who=extra.get("who", ""))
    return {"intent": intent, "tier": tier, "query": query, "speak": speak, "lang": lang, **extra}


def _clean(q: str) -> str:
    q = _STOPWORDS.sub(" ", q.strip(" .?!,।॥"))
    return re.sub(r"\s+", " ", q).strip(" .?!,।॥")


def _topic(text: str) -> str:
    """Pull the subject out of 'play some lofi music' — either word order.

    English puts it after the verb, Hindi and Bengali before it.
    """
    for pattern in (rf"\b(?:{_PLAY})\b\s+(?P<q>.+)", rf"^(?P<q>.+?)\s+(?:{_PLAY})"):
        m = re.search(pattern, text, re.I)
        if m and _clean(m.group("q")):
            return _clean(m.group("q"))
    return ""


# "message Rahul saying I'll be late" / "रोहन को मैसेज भेजो कि मैं लेट हूँ"
_WA_PATTERNS = [
    rf"(?:{_SEND})\s+(?:a\s+)?(?:message|msg|text)?\s*(?:to\s+)?(?P<who>.+?)\s+"
    rf"(?:on\s+whatsapp\s+)?(?:saying|that|:)\s+(?P<msg>.+)",
    rf"(?P<who>.+?)\s*(?:को|কে)\s*(?:व्हाट्सएप|হোয়াটসঅ্যাপ)?\s*(?:{_SEND})\s*(?:कि|যে|:)\s*(?P<msg>.+)",
]


def _whatsapp(text: str) -> dict | None:
    for pattern in _WA_PATTERNS:
        m = re.search(pattern, text, re.I)
        if not m:
            continue
        who = _clean(m.group("who")).strip(" ,")
        msg = m.group("msg").strip(" .?!,")
        # A name is one or two words; anything longer means the split went wrong.
        if who and msg and len(who.split()) <= 3:
            return {"who": who, "message": msg}
    return None
