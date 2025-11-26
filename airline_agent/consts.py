# consts.py
import os
from datetime import date, datetime

# Allow an optional override via env (AROYA_TODAY=YYYY-MM-DD); otherwise use today's date.
CURRENT_DATE_OVERRIDE: date | None = None


def _resolve_today() -> date:
    env_today = os.getenv("AROYA_TODAY")
    if env_today:
        try:
            return datetime.fromisoformat(env_today).date()
        except ValueError:
            pass
    return datetime.now().date()


def get_instruction_preamble() -> str:
    """Return instruction preamble with current date formatted cleanly."""
    effective_date = CURRENT_DATE_OVERRIDE or _resolve_today()
    current_date = effective_date.strftime("%B %d, %Y")
    return f"CURRENT DATE: {current_date}"
WELCOME_MESSAGE = """Hello and welcome aboard! I am your **Air Travel Companion**, your personal assistant for planning the perfect flight in seconds. ✈️

**Here’s what I can help you with:**
- 🌍 **Find flights** by city pair and exact travel date
- ⚡ **Book your ticket in seconds**
- 🧾 **Review baggage rules and amenities (Wi‑Fi, IFE)**
- 📊 **Compare options and prices**
- 🔔 **Track flight status for your booking**
- 👤 **Update your traveler profile and preferences**
- 🤖 **Answer all your airline-related questions**
- 🧑‍💼 **Connect you to a human agent**—share your email or phone for a callback

**Try asking me:**
- "Find flights from Hong Kong to Tokyo on 2025-11-29."
- "Book the YYZ → SIN flight on Nov 26."
- "Update my profile email."

**What can I do for you today?**"""

AGENT_NAME = "airline_agent"

INSTRUCTION_PREAMBLE = get_instruction_preamble()

# Response versioning for consistent front‑end parsing
# RESPONSE_VERSION = "1.0.0"
