"""Intent router check — English, Hindi and Bengali.

The one thing that must never misfire is the power tier: a misheard sentence
reaching desktop.power() shuts down a real machine.
"""

from app.tools.intents import detect, language_of


def test_power_words_are_gated_behind_confirmation():
    for phrase in (
        "shut down my laptop",
        "turn off the computer",
        "reboot my pc",
        "लैपटॉप बंद कर दो",
        "কম্পিউটার বন্ধ করো",
    ):
        got = detect(phrase)
        assert got and got["tier"] == "confirm", phrase


def test_safe_commands_run_straight_away():
    assert detect("open youtube")["query"] == "https://www.youtube.com"
    assert detect("open browser")["tier"] == "safe"
    assert detect("search for the weather in delhi")["query"] == "weather in delhi"
    assert detect("play some lofi music")["intent"] == "play_video"
    assert detect("i'm feeling bored")["intent"] == "cheer_up"
    assert detect("cancel the shutdown")["intent"] == "cancel_shutdown"
    assert detect("open notepad")["intent"] == "open_app"
    assert detect("open calculator")["query"] == "calculator"


def test_hindi_and_bengali():
    assert detect("यूट्यूब खोलो")["intent"] == "open_site"
    assert detect("ইউটিউব খোলো")["intent"] == "open_site"
    assert detect("कोई गाना बजाओ")["intent"] == "play_video"
    assert detect("একটা গান চালাও")["intent"] == "play_video"
    assert detect("मुझे बोर हो रहा है")["intent"] == "cheer_up"
    assert detect("খুব বোর লাগছে")["intent"] == "cheer_up"


def test_she_replies_in_the_script_you_used():
    assert language_of("यूट्यूब खोलो") == "hi"
    assert language_of("ইউটিউব খোলো") == "bn"
    assert language_of("open youtube") == "en"
    # Romanised Hindi stays English — a hi-IN voice mangles Latin letters.
    assert detect("youtube kholo")["lang"] == "en"
    assert "खोल" in detect("यूट्यूब खोलो")["speak"]
    assert "খুলছি" in detect("ইউটিউব খোলো")["speak"]


def test_whatsapp_extracts_person_and_message():
    got = detect("send a message to Rahul saying I will be late today")
    assert got["intent"] == "whatsapp" and got["tier"] == "confirm"
    assert got["who"].lower() == "rahul"
    assert "late" in got["message"]
    # Naming the app without a message is conversation, not a command.
    assert detect("whatsapp is not opening") is None


def test_real_work_goes_to_the_agent_workforce():
    for phrase in (
        "research the indian ev market and write me a summary",
        "build me a landing page plan",
        "compare react and vue for my project",
        "एक रिपोर्ट बनाओ",
        "একটা রিপোর্ট বানাও",
    ):
        got = detect(phrase)
        assert got and got["intent"] == "delegate", phrase
        # The whole sentence is the objective — trimming it loses constraints.
        assert got["query"] == phrase

    # Delegation is the last rule, so it must not steal device commands.
    for phrase, expected in (
        ("open youtube", "open_site"),
        ("play some music", "play_video"),
        ("search for weather", "search"),
        ("shut down my laptop", "shutdown"),
        ("send a message to Rahul saying hi", "whatsapp"),
    ):
        assert detect(phrase)["intent"] == expected, phrase


def test_conversation_is_not_a_command():
    for phrase in ("how are you today", "open the window in the story", "what is python"):
        assert detect(phrase) is None, phrase


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
