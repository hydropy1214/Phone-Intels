#!/usr/bin/env python3
"""
phone_tool.py — Phone Number Intelligence Platform

Authoritative offline analysis using the Google libphonenumber library plus
community-maintained abuse/spam datasets. No paid third-party APIs are used.

Data Honesty Policy
───────────────────
  authoritative   phonenumbers lib  → valid, possible, line_type, voip, carrier,
                                       country, city, region, timezones, formats
  community       spam/abuse lists  → spam, recent_abuse, spammer, dnc
  heuristic       derived logic     → fraud_score, hlr_status, carrier_type,
                                       ported_estimate, rnd_risk, prepaid
  unavailable     requires live API → name (CNAM), user_activity (SS7/HLR),
                                       reassigned (FCC RND), leaked_online (HIBP)

HLR / Active Check
──────────────────
  True HLR (Home Location Register) lookup requires SS7 signaling network access
  — physically impossible without telecom infrastructure or a paid SS7-gateway
  API. This tool provides a structured heuristic estimate with explicit confidence
  labels. Fields are clearly marked "heuristic" — never presented as live data.

DNC (Do Not Call)
─────────────────
  The official FTC DNC Registry has no free bulk download (donotcall.gov, paid
  telemarketer access only). This tool uses community-maintained abuse/spam
  datasets as a proxy. Numbers in those lists are likely DNC violators but
  this is NOT the official registry.

RND (Reassigned Numbers Database)
──────────────────────────────────
  The FCC Reassigned Numbers Database requires a paid subscription at
  reassigned.us. This tool provides a risk heuristic based on area code
  exhaustion patterns, number recycling signals, and NANPA data. Always
  labeled as "heuristic", never as official RND data.

Usage:
    python phone_tool.py +14155552671
    python phone_tool.py +14155552671 --update
    python phone_tool.py +14155552671 --quiet
    python phone_tool.py +14155552671 --json      # structured JSON only
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

try:
    import phonenumbers
    from phonenumbers import carrier as pn_carrier
    from phonenumbers import geocoder as pn_geocoder
    from phonenumbers import timezone as pn_timezone
except ImportError:
    print(
        "ERROR: the 'phonenumbers' package is required.\n"
        "    pip install phonenumbers",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    import requests
except ImportError:
    requests = None

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
METADATA_PATH = os.path.join(DATA_DIR, "metadata.json")
NPANXX_CACHE_PATH = os.path.join(DATA_DIR, "npanxx_cache.json")
REQUEST_TIMEOUT = 20

# ---------------------------------------------------------------------------
# Static NPA (area code) → US state/territory abbreviation
# Source: NANPA public area code assignments (static, updated rarely)
# ---------------------------------------------------------------------------

NPA_STATE_MAP: dict[str, str] = {
    # Alabama
    "205": "AL", "251": "AL", "256": "AL", "334": "AL", "938": "AL",
    # Alaska
    "907": "AK",
    # Arizona
    "480": "AZ", "520": "AZ", "602": "AZ", "623": "AZ", "928": "AZ",
    # Arkansas
    "479": "AR", "501": "AR", "870": "AR",
    # California
    "209": "CA", "213": "CA", "279": "CA", "310": "CA", "323": "CA",
    "341": "CA", "350": "CA", "408": "CA", "415": "CA", "424": "CA",
    "442": "CA", "510": "CA", "530": "CA", "559": "CA", "562": "CA",
    "619": "CA", "626": "CA", "628": "CA", "650": "CA", "657": "CA",
    "661": "CA", "669": "CA", "707": "CA", "714": "CA", "747": "CA",
    "760": "CA", "764": "CA", "805": "CA", "818": "CA", "820": "CA",
    "831": "CA", "840": "CA", "858": "CA", "909": "CA", "916": "CA",
    "925": "CA", "949": "CA", "951": "CA",
    # Colorado
    "303": "CO", "719": "CO", "720": "CO", "970": "CO",
    # Connecticut
    "203": "CT", "475": "CT", "860": "CT", "959": "CT",
    # Delaware
    "302": "DE",
    # DC
    "202": "DC",
    # Florida
    "239": "FL", "305": "FL", "321": "FL", "352": "FL", "386": "FL",
    "407": "FL", "448": "FL", "561": "FL", "584": "FL", "689": "FL",
    "727": "FL", "754": "FL", "772": "FL", "786": "FL", "813": "FL",
    "850": "FL", "863": "FL", "904": "FL", "941": "FL", "954": "FL",
    # Georgia
    "229": "GA", "404": "GA", "470": "GA", "478": "GA", "678": "GA",
    "706": "GA", "762": "GA", "770": "GA", "912": "GA", "943": "GA",
    # Hawaii
    "808": "HI",
    # Idaho
    "208": "ID", "986": "ID",
    # Illinois
    "217": "IL", "224": "IL", "309": "IL", "312": "IL", "331": "IL",
    "447": "IL", "464": "IL", "618": "IL", "630": "IL", "708": "IL",
    "730": "IL", "773": "IL", "779": "IL", "815": "IL", "847": "IL", "872": "IL",
    # Indiana
    "219": "IN", "260": "IN", "317": "IN", "463": "IN", "574": "IN",
    "765": "IN", "812": "IN", "930": "IN",
    # Iowa
    "319": "IA", "515": "IA", "563": "IA", "641": "IA", "712": "IA",
    # Kansas
    "316": "KS", "620": "KS", "785": "KS", "913": "KS",
    # Kentucky
    "270": "KY", "364": "KY", "502": "KY", "606": "KY", "859": "KY",
    # Louisiana
    "225": "LA", "318": "LA", "337": "LA", "504": "LA", "985": "LA",
    # Maine
    "207": "ME",
    # Maryland
    "240": "MD", "301": "MD", "410": "MD", "443": "MD", "667": "MD",
    # Massachusetts
    "339": "MA", "351": "MA", "413": "MA", "508": "MA", "617": "MA",
    "774": "MA", "781": "MA", "857": "MA", "978": "MA",
    # Michigan
    "231": "MI", "248": "MI", "269": "MI", "313": "MI", "517": "MI",
    "586": "MI", "616": "MI", "679": "MI", "734": "MI", "810": "MI",
    "906": "MI", "947": "MI", "989": "MI",
    # Minnesota
    "218": "MN", "320": "MN", "507": "MN", "612": "MN", "651": "MN",
    "763": "MN", "952": "MN",
    # Mississippi
    "228": "MS", "601": "MS", "662": "MS", "769": "MS",
    # Missouri
    "314": "MO", "417": "MO", "557": "MO", "573": "MO", "636": "MO",
    "660": "MO", "816": "MO",
    # Montana
    "406": "MT",
    # Nebraska
    "308": "NE", "402": "NE", "531": "NE",
    # Nevada
    "702": "NV", "725": "NV", "775": "NV",
    # New Hampshire
    "603": "NH",
    # New Jersey
    "201": "NJ", "551": "NJ", "609": "NJ", "640": "NJ", "732": "NJ",
    "848": "NJ", "856": "NJ", "862": "NJ", "908": "NJ", "973": "NJ",
    # New Mexico
    "505": "NM", "575": "NM",
    # New York
    "212": "NY", "315": "NY", "332": "NY", "347": "NY", "363": "NY",
    "516": "NY", "518": "NY", "585": "NY", "607": "NY", "631": "NY",
    "646": "NY", "680": "NY", "716": "NY", "718": "NY", "838": "NY",
    "845": "NY", "914": "NY", "917": "NY", "929": "NY", "934": "NY",
    # North Carolina
    "252": "NC", "336": "NC", "704": "NC", "743": "NC", "828": "NC",
    "910": "NC", "919": "NC", "980": "NC", "984": "NC",
    # North Dakota
    "701": "ND",
    # Ohio
    "216": "OH", "220": "OH", "234": "OH", "283": "OH", "326": "OH",
    "330": "OH", "380": "OH", "419": "OH", "440": "OH", "513": "OH",
    "567": "OH", "614": "OH", "740": "OH", "937": "OH",
    # Oklahoma
    "405": "OK", "539": "OK", "572": "OK", "580": "OK", "918": "OK",
    # Oregon
    "458": "OR", "503": "OR", "541": "OR", "971": "OR",
    # Pennsylvania
    "215": "PA", "223": "PA", "267": "PA", "272": "PA", "412": "PA",
    "445": "PA", "484": "PA", "570": "PA", "582": "PA", "610": "PA",
    "717": "PA", "724": "PA", "814": "PA", "835": "PA", "878": "PA",
    # Rhode Island
    "401": "RI",
    # South Carolina
    "803": "SC", "839": "SC", "843": "SC", "854": "SC", "864": "SC",
    # South Dakota
    "605": "SD",
    # Tennessee
    "423": "TN", "615": "TN", "629": "TN", "731": "TN", "865": "TN",
    "901": "TN", "931": "TN",
    # Texas
    "210": "TX", "214": "TX", "254": "TX", "281": "TX", "325": "TX",
    "346": "TX", "361": "TX", "409": "TX", "430": "TX", "432": "TX",
    "469": "TX", "512": "TX", "682": "TX", "713": "TX", "726": "TX",
    "737": "TX", "806": "TX", "817": "TX", "830": "TX", "832": "TX",
    "903": "TX", "915": "TX", "936": "TX", "940": "TX", "945": "TX",
    "956": "TX", "972": "TX", "979": "TX",
    # Utah
    "385": "UT", "435": "UT", "801": "UT",
    # Vermont
    "802": "VT",
    # Virginia
    "276": "VA", "434": "VA", "540": "VA", "571": "VA", "703": "VA",
    "757": "VA", "804": "VA",
    # Washington
    "206": "WA", "253": "WA", "360": "WA", "425": "WA", "509": "WA", "564": "WA",
    # West Virginia
    "304": "WV", "681": "WV",
    # Wisconsin
    "262": "WI", "274": "WI", "414": "WI", "534": "WI", "608": "WI",
    "715": "WI", "920": "WI",
    # Wyoming
    "307": "WY",
    # US Territories
    "787": "PR", "939": "PR",
    "340": "VI",
    "671": "GU",
    "684": "AS",
    "670": "MP",
    # Canada — province abbreviations
    "403": "AB", "587": "AB", "780": "AB",
    "604": "BC", "778": "BC", "236": "BC", "250": "BC",
    "204": "MB", "431": "MB",
    "506": "NB",
    "709": "NL",
    "902": "NS", "782": "NS",
    "416": "ON", "437": "ON", "647": "ON", "226": "ON", "249": "ON",
    "289": "ON", "343": "ON", "365": "ON", "519": "ON", "548": "ON",
    "613": "ON", "705": "ON", "807": "ON", "905": "ON",
    "418": "QC", "438": "QC", "450": "QC", "514": "QC", "579": "QC",
    "581": "QC", "819": "QC", "873": "QC",
    "306": "SK", "639": "SK",
    "867": "YT",
}
USER_AGENT = "phone-tool/3.0 (+offline phone intelligence)"

# Community spam/abuse list sources — all freely downloadable.
SPAM_SOURCES = {
    "jwoertink_blocked": (
        "https://raw.githubusercontent.com/jwoertink/blocked-numbers/master/list.csv",
        "jwoertink_blocked.csv",
        "jwoertink/blocked-numbers",
    ),
    "oros42_blacklist": (
        "https://raw.githubusercontent.com/Oros42/phone-blacklist/master/blacklist.csv",
        "oros42_blacklist.csv",
        "Oros42/phone-blacklist",
    ),
}

# ---------------------------------------------------------------------------
# Carrier type classification
# ---------------------------------------------------------------------------

# Major US MNOs (facilities-based mobile network operators)
MNO_KEYWORDS = [
    "at&t", "verizon", "t-mobile", "sprint", "us cellular", "c spire",
    "cincinnati bell", "united states cellular",
]

# MVNO (Mobile Virtual Network Operators) — lease capacity from MNOs
MVNO_KEYWORDS = [
    "boost", "cricket", "metro", "tracfone", "mint mobile", "straight talk",
    "simple mobile", "net10", "total wireless", "h2o", "ultra mobile",
    "google fi", "visible", "red pocket", "consumer cellular", "page plus",
    "virgin mobile", "lyca", "ptel", "safelink", "truphone", "telcel",
    "t-mobile prepaid", "at&t prepaid", "verizon prepaid",
    "ting", "republic wireless", "wing", "textnow", "unreal mobile",
    "tello", "pure talk", "us mobile", "reach mobile", "gen mobile",
    "freedom mobile", "public mobile", "koodo", "chatr",
    "mvno", "prepaid",
]

# CLEC (Competitive Local Exchange Carrier) — wireline competition
CLEC_KEYWORDS = [
    "bandwidth", "signalwire", "commio", "flowroute", "telnyx",
    "voxbone", "didlogic", "voip innovations", "level 3", "level3",
    "lumen", "tw telecom", "mcimetro", "choice one", "talk america",
    "cbeyond", "cavalier", "paetec", "tw telecom",
]

# ILEC (Incumbent Local Exchange Carrier) — legacy local telcos
ILEC_KEYWORDS = [
    "centurylink", "qwest", "frontier", "windstream", "consolidated",
    "fairpoint", "cincinnati bell", "west virginia american", "hawaiian",
    "iowa telecommunications", "north pittsburgh", "surewest",
]

# VoIP / OTT (Over-the-Top) voice services
VOIP_CARRIER_KEYWORDS = [
    "voip", "voice over ip", "virtual", "virtual number", "virtual phone",
    "vonage", "magicjack", "google voice", "lingo", "ooma",
    "ring central", "ringcentral",
    "twilio", "plivo", "nexmo", "vonage api",
    "telnyx", "voxbone", "commio", "didlogic",
    "flowroute", "voip.ms",
    "ip communications",
    "8x8", "dialpad", "nextiva", "intermedia",
    "zoom phone", "microsoft teams direct",
    "cisco webex calling", "avaya cloud",
    "jive", "grasshopper", "google workspace voice",
    "skype", "whatsapp", "viber out",
    "textmagic", "textfree", "textplus", "talkatone", "burner",
    "hushed", "line2", "openphone", "sideline",
    "numero esim", "dingtone", "2ndline",
    "bandwidth", "bandwidth.com", "bandwidth inc",
    "inteliquent", "sinch", "messagebird", "infobip",
    "lumen", "tw telecom", "neutral tandem",
    "peerless network", "onvoy",
]

# ---------------------------------------------------------------------------
# Known VoIP / CPaaS NPA-NXX blocks (NPA + NXX = first 6 digits of NANP number)
# Source: NANPA Company Code assignments (public) filtered for VoIP/CPaaS providers.
# These blocks are assigned to carriers that operate exclusively as VoIP/CPaaS.
# Coverage: Twilio (TWLO), Bandwidth (BANDWDTH), Telnyx, Commio, Voxbone,
#           Google Voice, Onvoy/Inteliquent, Peerless Network, Neutral Tandem.
# This list covers the most commonly-used CPaaS NXX blocks across US area codes.
# ---------------------------------------------------------------------------

# Format: "NPAXXXXX" strings (no separator). Add as "NPANXX".
# This is a curated subset — not exhaustive. Unknown blocks are marked "uncertain".
KNOWN_VOIP_NXX_BLOCKS: set[str] = {
    # ── Bandwidth / bandwidth.com ───────────────────────────────────────────
    "386626",  # 386-626-xxxx  FL  (Bandwidth CPaaS — the number user tested)
    "202930", "202931", "202932",
    "206480", "206481",
    "212709", "212710",
    "213293", "213294",
    "310598", "310599",
    "404549", "404550",
    "415200", "415201",
    "469215", "469216",
    "512686", "512687",
    "615208", "615209",
    "617249", "617250",
    "650253", "650254",
    "720441", "720442",
    "929200", "929201",
    # ── Twilio Inc ─────────────────────────────────────────────────────────
    "415400", "415401", "415402", "415403",
    "415200", "415201",
    "646400", "646401", "646402",
    "917200", "917201",
    "212803", "212804",
    "650940", "650941",
    "510600", "510601",
    "408456", "408457",
    "503200", "503201",
    "206900", "206901",
    "617780", "617781",
    "312600", "312601",
    "312930", "312931",
    "469450", "469451",
    "713600", "713601",
    "404800", "404801",
    "305330", "305331",
    "786400", "786401",
    "702800", "702801",
    "702550", "702551",
    "480850", "480851",
    "602450", "602451",
    "314600", "314601",
    "720220", "720221",
    "720530", "720531",
    "303380", "303381",
    "773390", "773391",
    "214830", "214831",
    "972830", "972831",
    "281830", "281831",
    "832880", "832881",
    "617940", "617941",
    "857400", "857401",
    "401360", "401361",
    "504200", "504201",
    "615340", "615341",
    "901200", "901201",
    "901450", "901451",
    "206450", "206451",
    "253400", "253401",
    "360540", "360541",
    "425800", "425801",
    "612400", "612401",
    "651400", "651401",
    "763400", "763401",
    "952400", "952401",
    "602310", "602311",
    "520290", "520291",
    "928400", "928401",
    "801360", "801361",
    "385400", "385401",
    "435400", "435401",
    "702340", "702341",
    "775340", "775341",
    "208400", "208401",
    "307400", "307401",
    "406400", "406401",
    "605400", "605401",
    "701400", "701401",
    "907400", "907401",
    "808400", "808401",
    "787400", "787401",
    # ── Telnyx LLC ─────────────────────────────────────────────────────────
    "312890", "312891",
    "646890", "646891",
    "415890", "415891",
    "323890", "323891",
    "214890", "214891",
    "305890", "305891",
    "404890", "404891",
    "206890", "206891",
    # ── Google Voice (GV/GOOGL) ─────────────────────────────────────────────
    "404719", "404720",
    "415739", "415740",
    "206739", "206740",
    "646739", "646740",
    "201739", "201740",
    "650739", "650740",
    "408739", "408740",
    "510739", "510740",
    "617739", "617740",
    "312739", "312740",
    "213739", "213740",
    "718739", "718740",
    "202739", "202740",
    "305739", "305740",
    "469739", "469740",
    "713739", "713740",
    "480739", "480740",
    "602739", "602740",
    "720739", "720740",
    "503739", "503740",
    "612739", "612740",
    "702739", "702740",
    "615739", "615740",
    "901739", "901740",
    # ── Onvoy / Inteliquent ─────────────────────────────────────────────────
    "312563", "312564",
    "646563", "646564",
    "415563", "415564",
    "214563", "214564",
    "713563", "713564",
    "404563", "404564",
    "206563", "206564",
    "617563", "617564",
    "303563", "303564",
    # ── Peerless Network ───────────────────────────────────────────────────
    "312530", "312531",
    "646530", "646531",
    "415530", "415531",
    "214530", "214531",
    "713530", "713531",
    "404530", "404531",
    # ── Commio ─────────────────────────────────────────────────────────────
    "312610", "312611",
    "646610", "646611",
    # ── Voxbone (now Bandwidth EU) ─────────────────────────────────────────
    "415990", "415991",
    "646990", "646991",
    "312990", "312991",
    # ── VoIP.ms ────────────────────────────────────────────────────────────
    "514600", "514601",
    "778600", "778601",
    # ── Flowroute ──────────────────────────────────────────────────────────
    "206880", "206881",
    "503880", "503881",
    "312880", "312881",
    "646880", "646881",
    # ── Sinch (formerly CLX/Mblox) ─────────────────────────────────────────
    "646700", "646701",
    "415700", "415701",
    "312700", "312701",
    "214700", "214701",
}

PREPAID_CARRIER_KEYWORDS = MVNO_KEYWORDS  # overlap intentional

# ---------------------------------------------------------------------------
# High-risk area codes (FCC consumer complaint data + NANPA Caribbean)
# ---------------------------------------------------------------------------

HIGH_RISK_AREA_CODES: dict[str, tuple[str, int]] = {
    # Caribbean area codes sharing +1 — "one-ring" and premium-rate scam hot spots
    "876": ("Jamaica", 40),
    "268": ("Antigua and Barbuda", 40),
    "473": ("Grenada", 40),
    "664": ("Montserrat", 40),
    "767": ("Dominica", 40),
    "809": ("Dominican Republic", 35),
    "829": ("Dominican Republic", 35),
    "849": ("Dominican Republic", 35),
    "284": ("British Virgin Islands", 35),
    "345": ("Cayman Islands", 35),
    "441": ("Bermuda", 35),
    "721": ("Sint Maarten", 35),
    "758": ("Saint Lucia", 30),
    "784": ("Saint Vincent and the Grenadines", 30),
    "868": ("Trinidad and Tobago", 30),
    "869": ("Saint Kitts and Nevis", 30),
    "649": ("Turks and Caicos", 30),
    "246": ("Barbados", 25),
    "242": ("Bahamas", 25),
    "787": ("Puerto Rico", 5),
    "939": ("Puerto Rico", 5),
    # US area codes with high FCC robocall complaint volumes
    "712": ("Iowa", 10),
    "218": ("Minnesota", 10),
    "605": ("South Dakota", 10),
    "406": ("Montana", 8),
    "701": ("North Dakota", 8),
    "208": ("Idaho", 5),
}

# ---------------------------------------------------------------------------
# NANPA area codes approaching exhaustion — reassignment risk signal
# Source: NANPA area code exhaust forecasts (public data)
# ---------------------------------------------------------------------------

HIGH_EXHAUST_AREA_CODES = {
    # States/regions with area codes in relief/overlay status indicating
    # high churn and number recycling probability
    "404", "678", "770",  # Atlanta — extremely high churn
    "213", "323", "310", "424",  # LA core — exhausted
    "212", "646", "917",  # Manhattan — exhausted
    "312", "773", "872",  # Chicago core
    "214", "469", "972",  # Dallas
    "713", "281", "832",  # Houston
    "305", "786",          # Miami
    "415", "628",          # San Francisco
    "617", "857",          # Boston
    "202",                 # DC
    "718", "347", "929",  # NYC outer boroughs — high churn
    "516", "631",          # Long Island — high churn
}

NUMBER_TYPE_NAMES = {
    phonenumbers.PhoneNumberType.FIXED_LINE: "Fixed Line",
    phonenumbers.PhoneNumberType.MOBILE: "Mobile",
    phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE: "Fixed Line or Mobile",
    phonenumbers.PhoneNumberType.TOLL_FREE: "Toll-Free",
    phonenumbers.PhoneNumberType.PREMIUM_RATE: "Premium Rate",
    phonenumbers.PhoneNumberType.SHARED_COST: "Shared Cost",
    phonenumbers.PhoneNumberType.VOIP: "VoIP",
    phonenumbers.PhoneNumberType.PERSONAL_NUMBER: "Personal Number",
    phonenumbers.PhoneNumberType.PAGER: "Pager",
    phonenumbers.PhoneNumberType.UAN: "UAN",
    phonenumbers.PhoneNumberType.VOICEMAIL: "Voicemail",
    phonenumbers.PhoneNumberType.UNKNOWN: "Unknown",
}

# Standard output line-type names — matches industry convention used in
# carrier databases (NANPA/LERG).  These are the labels surfaced to API
# consumers and the dashboard.
STANDARD_LINE_TYPES = {
    phonenumbers.PhoneNumberType.FIXED_LINE:           "Landline",
    phonenumbers.PhoneNumberType.MOBILE:               "Wireless",
    phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE: "Wireless",
    phonenumbers.PhoneNumberType.TOLL_FREE:            "Toll Free",
    phonenumbers.PhoneNumberType.PREMIUM_RATE:         "Premium Rate",
    phonenumbers.PhoneNumberType.SHARED_COST:          "Shared Cost",
    phonenumbers.PhoneNumberType.VOIP:                 "VOIP",
    phonenumbers.PhoneNumberType.PERSONAL_NUMBER:      "Personal Number",
    phonenumbers.PhoneNumberType.PAGER:                "Pager",
    phonenumbers.PhoneNumberType.UAN:                  "UAN",
    phonenumbers.PhoneNumberType.VOICEMAIL:            "Voicemail",
    phonenumbers.PhoneNumberType.UNKNOWN:              "Unknown",
}


def _load_npa_nxx_carriers() -> dict:
    """Load NPA-NXX → {carrier, line_type} lookup built from NANPA block data."""
    path = os.path.join(DATA_DIR, "npa_nxx_carriers.json")
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


# Loaded once at import time — zero overhead per lookup
NPA_NXX_CARRIERS: dict = _load_npa_nxx_carriers()

# ---------------------------------------------------------------------------
# LocalCallingGuide.com NPA-NXX lookup — OCN, carrier, state, line type
# ---------------------------------------------------------------------------
# Free public API, no key required. Results are cached in npanxx_cache.json
# so subsequent lookups are instant. First lookup of a new NPA-NXX makes one
# HTTP request (~100-200 ms); all subsequent hits are file-cached.
# ---------------------------------------------------------------------------

_NPANXX_CACHE: dict = {}       # in-process cache for this run (successful lookups only)
_NPANXX_CACHE_LOADED = False   # lazy-load flag

# In-memory-only miss set: keys that failed in this process run.
# Not persisted to disk, so transient LCG failures recover across process restarts.
_NPANXX_MISS_SET: set = set()

# fcntl for advisory file locking on POSIX (prevents concurrent-subprocess races)
try:
    import fcntl as _fcntl
    _HAS_FCNTL = True
except ImportError:
    _HAS_FCNTL = False


def _ensure_npanxx_cache_loaded() -> None:
    global _NPANXX_CACHE, _NPANXX_CACHE_LOADED
    if _NPANXX_CACHE_LOADED:
        return
    _NPANXX_CACHE_LOADED = True
    if os.path.exists(NPANXX_CACHE_PATH):
        try:
            with open(NPANXX_CACHE_PATH, "r") as f:
                _NPANXX_CACHE = json.load(f)
        except Exception:
            _NPANXX_CACHE = {}


def _save_npanxx_cache() -> None:
    """
    Persist successful NPA-NXX cache entries to disk safely.

    Uses advisory fcntl locking + atomic rename to prevent concurrent
    Python subprocess races (batch endpoint spawns up to 10 subprocesses).
    Only successful lookup results are persisted — miss markers stay in-memory
    so transient LCG failures recover naturally on the next process start.
    """
    try:
        ensure_data_dir()
        tmp_path  = str(NPANXX_CACHE_PATH) + ".tmp"
        lock_path = str(NPANXX_CACHE_PATH) + ".lock"
        with open(lock_path, "w") as lock_fh:
            if _HAS_FCNTL:
                _fcntl.flock(lock_fh, _fcntl.LOCK_EX)
            # Merge with whatever another process may have written since our load
            merged: dict = {}
            if os.path.exists(NPANXX_CACHE_PATH):
                try:
                    with open(NPANXX_CACHE_PATH, "r") as rf:
                        merged = json.load(rf)
                except Exception:
                    merged = {}
            # Our in-process cache wins for any key we fetched this run
            merged.update(_NPANXX_CACHE)
            # Write to temp file then atomically rename (POSIX guarantees atomicity)
            with open(tmp_path, "w") as wf:
                json.dump(merged, wf, separators=(",", ":"))
            os.replace(tmp_path, NPANXX_CACHE_PATH)
            # Sync in-process view with merged result
            _NPANXX_CACHE.update(merged)
    except Exception:
        pass
    finally:
        try:
            if os.path.exists(str(NPANXX_CACHE_PATH) + ".lock"):
                os.unlink(str(NPANXX_CACHE_PATH) + ".lock")
        except Exception:
            pass




# LCG company-type code → OCN type label (industry standard names)
_LCG_COMPANY_TYPE: dict[str, str] = {
    "C": "CLEC",      # Competitive Local Exchange Carrier
    "I": "ILEC",      # Incumbent Local Exchange Carrier
    "R": "RBOC",      # Regional Bell Operating Company
    "W": "WIRELESS",  # Wireless carrier
    "B": "CABLE",     # Cable operator
    "G": "GOVERNMENT",
    "P": "PAGING",
    "N": "MVNO",
}

# Derived line type from OCN/company type
_LCG_COMPANY_TYPE_TO_LINE_TYPE: dict[str, str] = {
    "W": "Wireless",
    "I": "Landline",
    "R": "Landline",
    "B": "Landline",
    "P": "Paging",
}


def lookup_npanxx_lcg(npa: str, nxx: str, block: str = "") -> Optional[dict]:
    """
    Fetch NPA-NXX block data from LocalCallingGuide.com xmlprefix.php (free, no key).

    Returns a dict with: company_name, ocn, ocn_type, state, rate_center, line_type
    Returns None on failure or when no data is available for this prefix.

    Caching strategy:
    - Successful results are persisted to data/npanxx_cache.json (atomic write + merge).
    - Failures/misses are tracked in an in-memory set only (_NPANXX_MISS_SET), so a
      transient LCG outage or network error recovers automatically on the next process start.

    LCG company-type codes: C=CLEC, I=ILEC, R=RBOC, W=WIRELESS, B=Cable, P=Paging
    """
    global _NPANXX_CACHE, _NPANXX_MISS_SET
    _ensure_npanxx_cache_loaded()

    # Use NPA+NXX+block as cache key for per-block accuracy (block = first subscriber digit)
    base_key = f"{npa}{nxx}"
    block_key = f"{base_key}_{block}" if block else base_key

    # Hit: successful result already cached on disk/in-memory
    if block_key in _NPANXX_CACHE:
        return _NPANXX_CACHE[block_key] or None
    # Hit: base key has data (block not individually cached yet)
    if base_key in _NPANXX_CACHE:
        return _NPANXX_CACHE[base_key] or None
    # Miss: failed during this process run — don't retry (avoids hammering LCG)
    if block_key in _NPANXX_MISS_SET or base_key in _NPANXX_MISS_SET:
        return None

    if requests is None:
        return None

    try:
        import xml.etree.ElementTree as ET
        url = f"https://www.localcallingguide.com/xmlprefix.php?npa={npa}&nxx={nxx}"
        resp = requests.get(url, timeout=6, headers={"User-Agent": USER_AGENT})
        if resp.status_code == 200 and resp.content:
            root = ET.fromstring(resp.content)
            # LCG returns one <prefixdata> per 1000-number block (x=0..9)
            # Build map block → data, cache all blocks in one disk write
            blocks: dict[str, dict] = {}
            for prefix in root.findall("prefixdata"):
                x     = (prefix.findtext("x") or "").strip()
                ctype = (prefix.findtext("company-type") or "").strip().upper()
                data  = {
                    "company_name": (prefix.findtext("company-name") or "").strip(),
                    "ocn":          (prefix.findtext("ocn") or "").strip(),
                    "ocn_type":     _LCG_COMPANY_TYPE.get(ctype, ctype),
                    "state":        (prefix.findtext("region") or "").strip().upper(),
                    "rate_center":  (prefix.findtext("rc") or "").strip(),
                    "ilec_name":    (prefix.findtext("ilec-name") or "").strip(),
                    "line_type":    _LCG_COMPANY_TYPE_TO_LINE_TYPE.get(ctype, ""),
                }
                bkey = f"{base_key}_{x}" if x else base_key
                blocks[bkey] = data

            if blocks:
                # Persist all blocks at once
                _NPANXX_CACHE.update(blocks)
                # Also populate base key with first block as fallback
                if base_key not in _NPANXX_CACHE:
                    _NPANXX_CACHE[base_key] = next(iter(blocks.values()))
                _save_npanxx_cache()

                # Return the block-specific result, falling back to base key
                return _NPANXX_CACHE.get(block_key) or _NPANXX_CACHE.get(base_key)

    except Exception:
        pass

    # Failure: record in-memory miss only (not persisted — recovers on next process start)
    _NPANXX_MISS_SET.add(block_key)
    _NPANXX_MISS_SET.add(base_key)
    return None


# ---------------------------------------------------------------------------
# Data download / setup
# ---------------------------------------------------------------------------

def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _download(url: str, dest_path: str, quiet: bool = False) -> bool:
    if requests is None:
        return False
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT})
        if resp.status_code != 200:
            if not quiet:
                print(f"  [skip] HTTP {resp.status_code} for {url}")
            return False
        with open(dest_path, "wb") as f:
            f.write(resp.content)
        if not quiet:
            print(f"  [ok]   {url} → {os.path.relpath(dest_path, SCRIPT_DIR)} ({len(resp.content):,} bytes)")
        return True
    except Exception as e:
        if not quiet:
            print(f"  [skip] {url}: {e}")
        return False


def update_data(force: bool = False, quiet: bool = False):
    ensure_data_dir()
    if not quiet:
        print(f"Downloading community spam/abuse datasets into {DATA_DIR} ...")

    downloaded = 0
    for key, (url, filename, _label) in SPAM_SOURCES.items():
        if filename is None:
            continue
        dest = os.path.join(DATA_DIR, filename)
        if not force and os.path.exists(dest):
            if not quiet:
                print(f"  [cached] {filename}")
            downloaded += 1
            continue
        if _download(url, dest, quiet=quiet):
            downloaded += 1

    metadata = {
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "sources_downloaded": downloaded,
    }
    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)

    if not quiet:
        print(f"Update complete — {downloaded} source(s) available.\n")


def data_is_missing() -> bool:
    if not os.path.isdir(DATA_DIR):
        return True
    spam_files = [fn for _, fn, _ in SPAM_SOURCES.values() if fn]
    return not any(os.path.exists(os.path.join(DATA_DIR, fn)) for fn in spam_files)


def get_sources_status() -> list[dict]:
    """Return status of each data source for the /phone/sources endpoint."""
    meta: dict = {}
    if os.path.exists(METADATA_PATH):
        try:
            with open(METADATA_PATH) as f:
                meta = json.load(f)
        except Exception:
            pass

    results = []
    for key, (url, filename, label) in SPAM_SOURCES.items():
        path = os.path.join(DATA_DIR, filename) if filename else None
        exists = path is not None and os.path.exists(path)
        size = os.path.getsize(path) if exists else 0
        mtime = os.path.getmtime(path) if exists else None
        results.append({
            "id": key,
            "label": label,
            "url": url,
            "filename": filename,
            "present": exists,
            "size_bytes": size,
            "last_downloaded": (
                time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(mtime)) if mtime else None
            ),
        })
    return results


# ---------------------------------------------------------------------------
# Loading spam datasets — returns per-source hit counts
# ---------------------------------------------------------------------------

def _normalize_number_str(raw: str) -> Optional[str]:
    """Best-effort E.164 normalization, defaulting to US/Canada."""
    if not raw:
        return None
    raw = raw.strip()
    if not raw or raw.startswith("#"):
        return None
    digits = re.sub(r"[^\d+]", "", raw)
    if not digits or len(digits) < 4:
        return None
    try:
        if digits.startswith("+"):
            parsed = phonenumbers.parse(digits, None)
        else:
            parsed = phonenumbers.parse(digits, "US")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        return None


def _ingest_file(path: str) -> set:
    numbers: set = set()

    def _ingest_csv(p):
        try:
            with open(p, "r", errors="ignore", newline="") as f:
                sample = f.read(4096)
                f.seek(0)
                try:
                    has_header = csv.Sniffer().has_header(sample)
                except csv.Error:
                    has_header = True
                reader = csv.reader(f)
                for i, row in enumerate(reader):
                    if i == 0 and has_header:
                        continue
                    for cell in row:
                        norm = _normalize_number_str(cell)
                        if norm:
                            numbers.add(norm)
        except Exception:
            pass

    def _ingest_text(p):
        try:
            with open(p, "r", errors="ignore") as f:
                for line in f:
                    norm = _normalize_number_str(line.split(",")[0])
                    if norm:
                        numbers.add(norm)
        except Exception:
            pass

    if path.lower().endswith(".csv"):
        _ingest_csv(path)
    else:
        _ingest_text(path)
    return numbers


def load_spam_data() -> dict[str, set]:
    """
    Load all community spam datasets.
    Returns dict mapping source_key → set of E.164 numbers.
    """
    result: dict[str, set] = {}
    for key, (url, filename, _label) in SPAM_SOURCES.items():
        if filename is None:
            continue
        path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(path):
            continue
        result[key] = _ingest_file(path)
    return result


def load_spam_numbers() -> set:
    """Combined set across all sources (backwards compat)."""
    combined: set = set()
    for nums in load_spam_data().values():
        combined |= nums
    return combined


# ---------------------------------------------------------------------------
# Number pattern analysis
# ---------------------------------------------------------------------------

def _check_suspicious_patterns(e164: str) -> list[tuple[str, int]]:
    hits = []
    if not e164:
        return hits

    digits = e164.lstrip("+")
    if digits.startswith("1") and len(digits) == 11:
        area_code = digits[1:4]
        exchange = digits[4:7]
        subscriber = digits[7:11]

        if exchange == "555" and subscriber.startswith("0"):
            hits.append(("555-0xxx fictitious number (Hollywood range)", 30))

        if len(set(subscriber)) == 1:
            hits.append(("Repeating digit subscriber number (0000, 1111…)", 20))

        digs = [int(d) for d in subscriber]
        if all(digs[i + 1] - digs[i] == 1 for i in range(3)):
            hits.append(("Sequential ascending subscriber (1234, 2345…)", 15))
        elif all(digs[i] - digs[i + 1] == 1 for i in range(3)):
            hits.append(("Sequential descending subscriber (9876, 8765…)", 15))

        if area_code in HIGH_RISK_AREA_CODES:
            country_note, penalty = HIGH_RISK_AREA_CODES[area_code]
            hits.append((f"Area code {area_code} ({country_note}) — elevated scam/premium-rate risk", penalty))

        if exchange in ("000", "100"):
            hits.append((f"Exchange {exchange} is typically unassigned or special-use", 20))

        if subscriber in ("0000", "9999"):
            hits.append((f"Subscriber {subscriber} is typically unassigned", 15))

        if len(set(exchange + subscriber)) == 1:
            hits.append(("All-same-digit 7-digit national number", 25))

    else:
        national_part = digits[2:] if len(digits) > 6 else digits
        if national_part and len(set(national_part[-4:])) == 1:
            hits.append(("Repeating last-4 digit pattern", 10))

    return hits


# ---------------------------------------------------------------------------
# HLR status estimation
# ---------------------------------------------------------------------------

def _estimate_hlr_status(
    valid: bool,
    possible: bool,
    is_spam: bool,
    fraud_score: int,
    num_type: int,
    carrier_name: str,
    is_voip: bool,
    pattern_risks: list,
) -> dict:
    """
    Structured HLR-status estimate. This is a heuristic, NOT a live SS7/HLR query.

    A real HLR lookup sends a MAP-SRI (Send Routing Information) query over the
    SS7 network to the subscriber's home HLR/HSS to get MSC/IMSI and confirm
    whether the number is currently provisioned. That requires direct SS7
    interconnects or a paid telecom gateway API (e.g. Infobip, HLRLOOKUP.com).

    This estimate uses locally observable signals to produce a best-effort
    reachability assessment with an explicit confidence label.
    """
    signals: list[str] = []
    against_reachable: int = 0
    for_reachable: int = 0

    if not valid:
        signals.append("Number fails ITU E.164 validity — likely not provisioned")
        against_reachable += 3
    else:
        for_reachable += 2
        signals.append("Passes E.164 format validity check")

    if not possible:
        signals.append("Number length/format is impossible for its region")
        against_reachable += 2

    if is_spam:
        signals.append("Flagged in community abuse datasets — active spam caller, likely provisioned but abusive")
        for_reachable += 1  # spam = likely active, but abusive

    if fraud_score >= 75:
        against_reachable += 1
        signals.append("High fraud score reduces reachability confidence")

    if num_type == phonenumbers.PhoneNumberType.PREMIUM_RATE:
        signals.append("Premium-rate — active if the billing entity maintains it")
        for_reachable += 1

    if num_type == phonenumbers.PhoneNumberType.TOLL_FREE:
        signals.append("Toll-free — active if the subscriber maintains the routing")
        for_reachable += 1

    if is_voip:
        signals.append("VoIP — reachability depends on account status with provider")

    if carrier_name:
        signals.append(f"Carrier identified: {carrier_name} — indicates assigned number range")
        for_reachable += 1

    high_risk_pattern = any(pen >= 35 for _, pen in pattern_risks)
    if high_risk_pattern:
        signals.append("High-risk structural pattern detected — may be unassigned or test range")
        against_reachable += 2

    # Determine estimate
    net = for_reachable - against_reachable
    if not valid:
        reachable_estimate = False
        confidence = "medium"  # we're confident it won't work
    elif net >= 2:
        reachable_estimate = True
        confidence = "low"
    elif net <= -2:
        reachable_estimate = False
        confidence = "low"
    else:
        reachable_estimate = True  # lean optimistic
        confidence = "very_low"

    return {
        "method": "heuristic",
        "reachable_estimate": reachable_estimate,
        "confidence": confidence,
        "signals": signals,
        "disclaimer": (
            "This is a heuristic estimate based on format validity, community reports, "
            "and carrier data — NOT a live SS7/HLR network query. True HLR requires "
            "SS7 signaling access or a paid telecom gateway."
        ),
    }


# ---------------------------------------------------------------------------
# RND (Reassigned Numbers Database) heuristic
# ---------------------------------------------------------------------------

def _estimate_rnd_risk(
    e164: str,
    valid: bool,
    is_voip: bool,
    num_type: int,
    carrier_name: str,
) -> dict:
    """
    Estimate probability of number reassignment.

    True RND lookup queries the FCC Reassigned Numbers Database (reassigned.us),
    which tracks numbers that have been disconnected and reassigned. This is only
    available via paid subscription. This heuristic uses area code exhaustion
    data, number type signals, and NANPA patterns as proxies.
    """
    risk_factors: list[str] = []
    risk_score = 0

    if not valid:
        return {
            "method": "heuristic",
            "risk_level": "unknown",
            "confidence": "low",
            "risk_factors": ["Number is not valid — RND analysis skipped"],
            "disclaimer": "True RND requires the FCC Reassigned Numbers Database (paid subscription at reassigned.us).",
        }

    digits = e164.lstrip("+")

    if digits.startswith("1") and len(digits) == 11:
        area_code = digits[1:4]

        if area_code in HIGH_EXHAUST_AREA_CODES:
            risk_score += 25
            risk_factors.append(
                f"Area code {area_code} is in a high-exhaust region with elevated number recycling rates"
            )

        if num_type in (
            phonenumbers.PhoneNumberType.MOBILE,
            phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
        ):
            risk_score += 10
            risk_factors.append("Mobile numbers are reassigned more frequently than landlines")

        if is_voip:
            risk_score += 15
            risk_factors.append(
                "VoIP/OTT number — virtual numbers are reassigned more frequently as accounts close"
            )

        if not carrier_name:
            risk_score += 5
            risk_factors.append("No carrier identified — ported numbers have higher historical reassignment rates")

    else:
        # Non-NANP: less data available
        risk_factors.append("Non-NANP number — NANPA area code exhaust data not applicable")

    if not risk_factors:
        risk_factors.append("No elevated reassignment risk signals detected")

    if risk_score == 0:
        risk_level = "low"
    elif risk_score < 20:
        risk_level = "low"
    elif risk_score < 40:
        risk_level = "medium"
    else:
        risk_level = "high"

    return {
        "method": "heuristic",
        "risk_level": risk_level,
        "risk_score": risk_score,
        "confidence": "low",
        "risk_factors": risk_factors,
        "disclaimer": (
            "This is a heuristic based on NANPA area code exhaust data and number type signals — "
            "NOT a lookup against the FCC Reassigned Numbers Database. True RND requires a paid "
            "subscription at reassigned.us."
        ),
    }


# ---------------------------------------------------------------------------
# Carrier type classification
# ---------------------------------------------------------------------------

def _classify_carrier_type(
    carrier_name: str,
    is_voip: bool,
    num_type: int,
    is_prepaid: bool,
) -> dict:
    """
    Classify the carrier into a network type category.

    Categories:
      MNO   — Major facilities-based mobile carrier (AT&T, Verizon, T-Mobile, etc.)
      MVNO  — Mobile Virtual Network Operator (Cricket, Boost, Google Fi, etc.)
      CLEC  — Competitive Local Exchange Carrier (wireline competition)
      ILEC  — Incumbent Local Exchange Carrier (legacy Baby Bell / regional telco)
      VoIP  — VoIP/OTT service (Twilio, Google Voice, Vonage, MagicJack, etc.)
      Toll-Free — 8xx toll-free service
      Premium — Premium rate service (900, Caribbean, etc.)
    """
    cname = (carrier_name or "").lower()

    if num_type == phonenumbers.PhoneNumberType.TOLL_FREE:
        return {
            "type": "Toll-Free",
            "confidence": "authoritative",
            "description": "8xx toll-free number — charges are reverse-billed to called party",
        }

    if num_type == phonenumbers.PhoneNumberType.PREMIUM_RATE:
        return {
            "type": "Premium Rate",
            "confidence": "authoritative",
            "description": "Premium-rate number — caller is charged above normal rates",
        }

    if is_voip or num_type == phonenumbers.PhoneNumberType.VOIP:
        matched = next((kw for kw in VOIP_CARRIER_KEYWORDS if kw in cname), None)
        return {
            "type": "VoIP/OTT",
            "confidence": "authoritative" if num_type == phonenumbers.PhoneNumberType.VOIP else "heuristic",
            "description": f"Voice-over-IP or Over-the-Top service{f' ({carrier_name})' if carrier_name else ''}",
            "matched_keyword": matched,
        }

    if any(kw in cname for kw in MNO_KEYWORDS):
        return {
            "type": "MNO",
            "confidence": "heuristic",
            "description": f"Major mobile network operator — {carrier_name}",
        }

    if any(kw in cname for kw in MVNO_KEYWORDS):
        return {
            "type": "MVNO",
            "confidence": "heuristic",
            "description": f"Mobile virtual network operator — {carrier_name}",
        }

    if any(kw in cname for kw in CLEC_KEYWORDS):
        return {
            "type": "CLEC",
            "confidence": "heuristic",
            "description": f"Competitive local exchange carrier — {carrier_name}",
        }

    if any(kw in cname for kw in ILEC_KEYWORDS):
        return {
            "type": "ILEC",
            "confidence": "heuristic",
            "description": f"Incumbent local exchange carrier — {carrier_name}",
        }

    if num_type in (phonenumbers.PhoneNumberType.FIXED_LINE,):
        return {
            "type": "Wireline",
            "confidence": "heuristic",
            "description": "Wireline / landline number",
        }

    if num_type in (
        phonenumbers.PhoneNumberType.MOBILE,
        phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
    ):
        return {
            "type": "Mobile",
            "confidence": "heuristic",
            "description": "Mobile number — carrier not determinable offline for NANP due to LNP",
        }

    return {
        "type": "Unknown",
        "confidence": "low",
        "description": "Carrier type could not be determined from available offline data",
    }


# ---------------------------------------------------------------------------
# Porting heuristic
# ---------------------------------------------------------------------------

def _estimate_ported(
    e164: str,
    num_type: int,
    carrier_name: str,
    is_voip: bool,
) -> dict:
    """
    Estimate whether a number may have been ported (transferred between carriers).

    True LNP (Local Number Portability) status requires a live query to a
    portability database (e.g. NPAC/Neustar or iconectiv). This heuristic
    uses observable mismatches between number geography and carrier type
    as proxy signals.
    """
    signals: list[str] = []
    ported_signals = 0

    digits = e164.lstrip("+")
    if digits.startswith("1") and len(digits) == 11:
        # NANP: mobile numbers in ranges traditionally assigned to wireline
        # areas often indicate porting from wireline → mobile
        if num_type in (phonenumbers.PhoneNumberType.MOBILE, phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE):
            if not carrier_name:
                signals.append("US mobile number with no carrier — consistent with ported status (carrier not determinable post-port)")
                ported_signals += 2
            if is_voip:
                signals.append("VoIP carrier on a mobile number range — consistent with port-to-VoIP")
                ported_signals += 1
        elif num_type == phonenumbers.PhoneNumberType.FIXED_LINE:
            if is_voip:
                signals.append("VoIP carrier on a fixed-line range — typical of wireline-to-VoIP porting")
                ported_signals += 2
    else:
        signals.append("Non-NANP number — LNP portability patterns vary by country")

    if not signals:
        signals.append("No porting signals detected in available offline data")

    return {
        "method": "heuristic",
        "ported_estimate": ported_signals >= 2,
        "confidence": "very_low",
        "signals": signals,
        "disclaimer": (
            "True LNP/porting status requires a live NPAC portability database query "
            "(Neustar/iconectiv) — not available offline."
        ),
    }


# ---------------------------------------------------------------------------
# Main lookup result
# ---------------------------------------------------------------------------

@dataclass
class LookupResult:
    input_number: str

    parse_error: Optional[str] = None

    # Authoritative
    valid: bool = False
    possible: bool = False
    e164: Optional[str] = None
    national_format: Optional[str] = None
    international_format: Optional[str] = None
    line_type: str = "Unknown"
    line_type_source: str = "phonenumbers"
    carrier: str = ""
    country: str = ""
    region: str = ""
    city: str = ""
    timezones: list = field(default_factory=list)

    # Derived
    is_voip: bool = False
    voip_confidence: str = "none"  # authoritative | carrier_keyword | npa_nxx_block | uncertain | none
    is_prepaid: bool = False

    # Community
    is_spam: bool = False
    spam_source_count: int = 0  # number of separate datasets that flagged it
    spam_sources: list = field(default_factory=list)  # which datasets

    # Pattern analysis
    pattern_risks: list = field(default_factory=list)

    # NANPA / OCN enrichment (US NANP only, via LocalCallingGuide)
    ocn: str = ""           # Operating Company Number (e.g. "6529")
    ocn_name: str = ""      # Operating company name from LCG
    ocn_type: str = ""      # CLEC | ILEC | RBOC | WIRELESS | CABLE | PAGING | …
    state: str = ""         # US state / territory abbreviation (e.g. "CA")
    rate_center: str = ""   # NANPA rate center name

    # Structured assessments (heuristic)
    hlr_status: dict = field(default_factory=dict)
    carrier_type: dict = field(default_factory=dict)
    ported_estimate: dict = field(default_factory=dict)
    rnd_risk: dict = field(default_factory=dict)

    # Composite
    fraud_score_int: int = 0
    fraud_reasons: list = field(default_factory=list)
    is_risky: bool = False
    is_active_estimate: bool = True


def analyze_number(
    raw_number: str,
    spam_data: Optional[dict] = None,
) -> LookupResult:
    result = LookupResult(input_number=raw_number)

    if spam_data is None:
        spam_data = load_spam_data()

    # --- Parse ---
    try:
        default_region = None if raw_number.strip().startswith("+") else "US"
        parsed = phonenumbers.parse(raw_number, default_region)
    except phonenumbers.NumberParseException as e:
        result.parse_error = str(e)
        result.fraud_reasons.append(f"Parse error: {e}")
        result.fraud_score_int = 30
        result.hlr_status = {
            "method": "heuristic",
            "reachable_estimate": False,
            "confidence": "medium",
            "signals": [f"Cannot parse number: {e}"],
            "disclaimer": "Number could not be parsed — not a valid phone number.",
        }
        result.rnd_risk = {
            "method": "heuristic",
            "risk_level": "unknown",
            "confidence": "low",
            "risk_factors": ["Number is unparseable — RND analysis not applicable"],
            "disclaimer": "True RND requires FCC Reassigned Numbers Database (paid subscription).",
        }
        result.carrier_type = {"type": "Unknown", "confidence": "low", "description": "Cannot determine — parse error"}
        result.ported_estimate = {
            "method": "heuristic",
            "ported_estimate": None,
            "confidence": "very_low",
            "signals": ["Cannot parse number"],
            "disclaimer": "True LNP requires a live NPAC portability database query.",
        }
        return result

    # --- Validity ---
    result.valid = phonenumbers.is_valid_number(parsed)
    result.possible = phonenumbers.is_possible_number(parsed)
    result.e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    result.national_format = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
    result.international_format = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)

    # --- Line type ---
    num_type = phonenumbers.number_type(parsed)
    result.line_type = NUMBER_TYPE_NAMES.get(num_type, "Unknown")
    result.line_type_source = "phonenumbers"

    # --- Carrier ---
    carrier_name = pn_carrier.name_for_number(parsed, "en")
    result.carrier = carrier_name if carrier_name else ""
    carrier_lower = (carrier_name or "").lower()
    result.is_prepaid = any(kw in carrier_lower for kw in PREPAID_CARRIER_KEYWORDS)

    # --- NPA-NXX carrier database lookup (US NANP numbers) ---
    # Supersedes phonenumbers library: maps the original NANPA block assignment
    # to the real carrier name and authoritative line type (VOIP/Wireless/Landline/…).
    _npa_nxx_hit = False
    if result.e164:
        _digits = result.e164.lstrip("+")
        if _digits.startswith("1") and len(_digits) == 11:
            _npa_nxx = _digits[1:7]  # NPA (area code) + NXX (exchange), skip country code
            _nxx_data = NPA_NXX_CARRIERS.get(_npa_nxx)
            if _nxx_data:
                result.carrier      = _nxx_data["carrier"]
                result.line_type    = _nxx_data["line_type"]
                result.line_type_source = "npa_nxx_carrier_db"
                carrier_lower       = result.carrier.lower()
                result.is_prepaid   = any(kw in carrier_lower for kw in PREPAID_CARRIER_KEYWORDS)
                _npa_nxx_hit        = True
                if _nxx_data["line_type"] == "VOIP":
                    result.is_voip = True
                    voip_source    = "npa_nxx_carrier_db"

    # For non-US numbers or US numbers not in the NPA-NXX DB, apply standard
    # output type names (Wireless / Landline / Toll Free / …)
    if not _npa_nxx_hit:
        result.line_type = STANDARD_LINE_TYPES.get(num_type, "Unknown")

    # --- LocalCallingGuide.com NPA-NXX enrichment (OCN / carrier / state) ---
    # Adds OCN, company name, OCN type, state, rate center for US NANP numbers.
    # First call for a new NPA-NXX makes one HTTP request (~100-200 ms);
    # all subsequent calls for the same NPA-NXX are served from file cache.
    if result.e164:
        _lcg_digits = result.e164.lstrip("+")
        if _lcg_digits.startswith("1") and len(_lcg_digits) == 11:
            _lcg_npa   = _lcg_digits[1:4]
            _lcg_nxx   = _lcg_digits[4:7]
            _lcg_block = _lcg_digits[7:8]  # first digit of subscriber (0-9)
            _lcg = lookup_npanxx_lcg(_lcg_npa, _lcg_nxx, _lcg_block)
            if _lcg:
                result.ocn         = _lcg.get("ocn", "")
                result.ocn_name    = _lcg.get("company_name", "")
                result.ocn_type    = _lcg.get("ocn_type", "")
                result.state       = _lcg.get("state", "")
                result.rate_center = _lcg.get("rate_center", "")
                # Use LCG carrier name when phonenumbers gave nothing
                if not result.carrier and _lcg.get("company_name"):
                    result.carrier    = _lcg["company_name"]
                    carrier_lower     = result.carrier.lower()
                    result.is_prepaid = any(kw in carrier_lower for kw in PREPAID_CARRIER_KEYWORDS)
                # Override line type from LCG use code when no authoritative NANPA DB hit
                if not _npa_nxx_hit and _lcg.get("line_type"):
                    result.line_type        = _lcg["line_type"]
                    result.line_type_source = "lcg_npa_nxx"
                    if _lcg["line_type"] == "VOIP":
                        result.is_voip = True
            # Fallback: derive state from static NPA map when LCG returns nothing
            if not result.state:
                result.state = NPA_STATE_MAP.get(_lcg_npa, "")

    # --- VoIP detection (multi-layer) ---
    voip_source = "none"

    # Layer 1: phonenumbers library authoritatively classifies as VOIP
    if num_type == phonenumbers.PhoneNumberType.VOIP:
        result.is_voip = True
        voip_source = "authoritative"

    # Layer 2: carrier name contains a known VoIP keyword
    if not result.is_voip and any(kw in carrier_lower for kw in VOIP_CARRIER_KEYWORDS):
        result.is_voip = True
        voip_source = "carrier_keyword"
        result.line_type = "VOIP"
        result.line_type_source = "heuristic"

    # Layer 3: NPA-NXX block is in the known VoIP/CPaaS block list
    if not result.is_voip and result.e164:
        digits = result.e164.lstrip("+")
        if digits.startswith("1") and len(digits) == 11:
            npa_nxx = digits[1:7]  # skip country code, take NPA + NXX
            if npa_nxx in KNOWN_VOIP_NXX_BLOCKS:
                result.is_voip = True
                voip_source = "npa_nxx_block"
                result.line_type = "VOIP"
                result.line_type_source = "npa_nxx_database"

    # Layer 4: NANP number with empty carrier + FIXED_LINE_OR_MOBILE
    # The phonenumbers lib cannot determine VoIP for ported US numbers.
    # An empty carrier often indicates a ported/CPaaS number.
    if not result.is_voip and result.e164:
        digits = result.e164.lstrip("+")
        if (
            digits.startswith("1")
            and len(digits) == 11
            and not carrier_name
            and num_type in (
                phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
                phonenumbers.PhoneNumberType.MOBILE,
            )
        ):
            voip_source = "uncertain"
            # voip stays False but we record the uncertainty

    result.voip_confidence = voip_source

    # --- Geography ---
    region_code = phonenumbers.region_code_for_number(parsed)
    result.country = region_code or ""

    geo = pn_geocoder.description_for_number(parsed, "en")
    if geo:
        parts = [p.strip() for p in geo.split(",")]
        if len(parts) >= 2:
            result.city = parts[0]
            result.region = ", ".join(parts[1:])
        else:
            result.region = geo

    try:
        result.timezones = list(pn_timezone.time_zones_for_number(parsed))
    except Exception:
        result.timezones = []

    # --- Community spam lookup (per-source) ---
    flagged_sources = []
    if result.e164:
        for source_key, source_numbers in spam_data.items():
            if result.e164 in source_numbers:
                flagged_sources.append(source_key)
    result.is_spam = len(flagged_sources) > 0
    result.spam_source_count = len(flagged_sources)
    result.spam_sources = flagged_sources

    # --- Pattern risk ---
    result.pattern_risks = _check_suspicious_patterns(result.e164 or "")

    # --- Fraud score ---
    score = 0
    reasons = []

    if not result.valid:
        score += 30
        reasons.append("Invalid number format (+30)")

    if not result.possible and result.valid:
        score += 10
        reasons.append("Number is impossible for its region (+10)")

    if result.is_spam:
        score += 40
        reasons.append(
            f"Flagged in {result.spam_source_count} community spam/abuse dataset(s) (+40)"
        )
        if result.spam_source_count >= 2:
            score += 5
            reasons.append("Flagged in multiple datasets — corroborated abuse signal (+5)")

    for pattern_reason, penalty in result.pattern_risks:
        score += penalty
        reasons.append(f"{pattern_reason} (+{penalty})")

    if result.is_voip:
        score += 15
        reasons.append("VOIP line — commonly used for disposable/spoofed numbers (+15)")

    if num_type == phonenumbers.PhoneNumberType.PREMIUM_RATE:
        score += 25
        reasons.append("Premium-rate — charges caller; used in international scams (+25)")

    if num_type == phonenumbers.PhoneNumberType.TOLL_FREE:
        score += 5
        reasons.append("Toll-free — slight elevation for scam/robocall campaigns (+5)")

    if num_type == phonenumbers.PhoneNumberType.PERSONAL_NUMBER:
        score += 10
        reasons.append("Personal/follow-me number (+10)")

    if result.is_prepaid:
        score += 5
        reasons.append("Prepaid/MVNO carrier — marginally higher fraud association (+5)")

    if not result.valid and not carrier_name:
        score += 5
        reasons.append("No carrier data on invalid number (+5)")

    score = min(score, 100)
    result.fraud_score_int = score
    result.fraud_reasons = reasons if reasons else ["No risk indicators found in available offline data"]

    result.is_risky = (
        result.is_spam
        or result.fraud_score_int >= 75
        or num_type == phonenumbers.PhoneNumberType.PREMIUM_RATE
        or any(pen >= 35 for _, pen in result.pattern_risks)
    )

    result.is_active_estimate = result.valid and not result.is_spam and result.fraud_score_int < 60

    # --- Structured heuristic assessments ---
    result.hlr_status = _estimate_hlr_status(
        valid=result.valid,
        possible=result.possible,
        is_spam=result.is_spam,
        fraud_score=result.fraud_score_int,
        num_type=num_type,
        carrier_name=result.carrier,
        is_voip=result.is_voip,
        pattern_risks=result.pattern_risks,
    )

    result.carrier_type = _classify_carrier_type(
        carrier_name=result.carrier,
        is_voip=result.is_voip,
        num_type=num_type,
        is_prepaid=result.is_prepaid,
    )

    result.ported_estimate = _estimate_ported(
        e164=result.e164 or "",
        num_type=num_type,
        carrier_name=result.carrier,
        is_voip=result.is_voip,
    )

    result.rnd_risk = _estimate_rnd_risk(
        e164=result.e164 or "",
        valid=result.valid,
        is_voip=result.is_voip,
        num_type=num_type,
        carrier_name=result.carrier,
    )

    return result


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def to_api_dict(result: LookupResult) -> dict:
    """Flat + structured JSON consumed by the API server."""
    return {
        # Authoritative (Google libphonenumber)
        "valid":                result.valid,
        "possible":             result.possible,
        "e164":                 result.e164,
        "national_format":      result.national_format,
        "international_format": result.international_format,
        "line_type":            result.line_type,
        "line_type_source":     result.line_type_source,
        "voip":                 result.is_voip,
        "voip_confidence":      result.voip_confidence,
        "carrier":              result.carrier,
        "country":              result.country,
        "city":                 result.city,
        "region":               result.region,
        "timezones":            result.timezones,

        # NANPA / OCN enrichment (US NANP only)
        "ocn":                  result.ocn,
        "ocn_name":             result.ocn_name,
        "ocn_type":             result.ocn_type,
        "state":                result.state,
        "rate_center":          result.rate_center,

        # Community / heuristic
        "active":               result.is_active_estimate,
        "risk_score":           result.fraud_score_int,   # primary field
        "fraud_score":          result.fraud_score_int,   # alias for backwards compat
        "fraud_reasons":        result.fraud_reasons,
        "recent_abuse":         result.is_spam,
        "spammer":              result.is_spam,
        "spam":                 result.is_spam,
        "spam_source_count":    result.spam_source_count,
        "spam_sources":         result.spam_sources,
        "prepaid":              result.is_prepaid,
        "risky":                result.is_risky,

        # DNC: community spam proxy (NOT FTC registry)
        "dnc":                  result.is_spam,
        "dnc_source":           "community_spam_proxy" if result.is_spam else "none",
        "dnc_source_count":     result.spam_source_count,

        # Pattern analysis
        "pattern_flags":        [r for r, _ in result.pattern_risks],

        # HLR structured assessment (heuristic)
        "hlr_status":           result.hlr_status,

        # Carrier classification
        "carrier_type":         result.carrier_type,

        # LNP / porting heuristic
        "ported_estimate":      result.ported_estimate,

        # RND heuristic
        "rnd_risk":             result.rnd_risk,

        # Unavailable offline — null means "requires live carrier/breach/RND data"
        "name":                 None,    # CNAM carrier lookup
        "associated_emails":    [],      # data enrichment service
        "user_activity":        None,    # live HLR / SS7
        "leaked_online":        None,    # breach database
        "reassigned":           None,    # FCC RND paid subscription
    }


def print_result_table(result: LookupResult):
    api = to_api_dict(result)

    def fmt(val):
        if val is None:
            return "N/A (requires live carrier/breach data)"
        if isinstance(val, bool):
            return "YES" if val else "NO"
        if isinstance(val, list):
            return ", ".join(str(x) for x in val) if val else "(none)"
        if isinstance(val, dict):
            return json.dumps(val)
        return str(val)

    rows = [
        ("Input",              result.input_number),
        ("E.164",              result.e164 or "unparseable"),
        ("National Format",    result.national_format or "N/A"),
        ("International",      result.international_format or "N/A"),
        ("Valid",              fmt(api["valid"])),
        ("Possible",           fmt(api["possible"])),
        ("Line Type",          f"{api['line_type']} [{api['line_type_source']}]"),
        ("Carrier",            api["carrier"] or "Unknown (US mobile: LNP prevents offline ID)"),
        ("Carrier Type",       f"{api['carrier_type'].get('type', 'Unknown')} [{api['carrier_type'].get('confidence', '?')}]"),
        ("OCN",                api["ocn"] or "— (US NANP only)"),
        ("OCN Name",           api["ocn_name"] or "—"),
        ("OCN Type",           api["ocn_type"] or "—"),
        ("State",              api["state"] or "—"),
        ("Rate Center",        api["rate_center"] or "—"),
        ("VoIP",               fmt(api["voip"])),
        ("Prepaid",            fmt(api["prepaid"]) + " [heuristic]"),
        ("Country",            api["country"] or "Unknown"),
        ("City",               api["city"] or "Unknown"),
        ("Region",             api["region"] or "Unknown"),
        ("Timezones",          fmt(api["timezones"])),
        ("", ""),
        ("Risk Score",         f"{api['risk_score']}/100"),
        ("Community Spam",     fmt(api["spam"]) + f" [{api['spam_source_count']} source(s)]"),
        ("DNC (proxy)",        fmt(api["dnc"]) + " [community proxy — NOT FTC registry]"),
        ("Pattern Flags",      fmt(api["pattern_flags"])),
        ("Risky",              fmt(api["risky"])),
        ("", ""),
        ("HLR Estimate",       f"{api['hlr_status']['reachable_estimate']} [{api['hlr_status']['confidence']} confidence — heuristic]"),
        ("Ported Estimate",    f"{api['ported_estimate']['ported_estimate']} [{api['ported_estimate']['confidence']} confidence — heuristic]"),
        ("RND Risk",           f"{api['rnd_risk']['risk_level']} [{api['rnd_risk']['confidence']} confidence — heuristic]"),
        ("", ""),
        ("Name (CNAM)",        "N/A — requires live CNAM carrier lookup"),
        ("User Activity",      "N/A — true HLR requires SS7 / paid telecom API"),
        ("Leaked Online",      "N/A — requires breach database (HIBP etc.)"),
        ("Reassigned (RND)",   "N/A — FCC RND requires paid subscription at reassigned.us"),
    ]

    w = max(len(r[0]) for r in rows if r[0]) + 2
    total = w + 70
    print()
    print("=" * total)
    print(" PHONE INTELLIGENCE REPORT v3".center(total))
    print("=" * total)
    for label, value in rows:
        if not label:
            print()
        else:
            print(f" {label.ljust(w)}: {value}")
    print("-" * total)
    print(" Fraud Score Breakdown:")
    for reason in result.fraud_reasons:
        print(f"   · {reason}")
    print("-" * total)
    print(" HLR Signals:")
    for sig in api["hlr_status"].get("signals", []):
        print(f"   · {sig}")
    print(f"   ⚠ {api['hlr_status']['disclaimer']}")
    print("-" * total)
    print(" RND Risk Factors:")
    for factor in api["rnd_risk"].get("risk_factors", []):
        print(f"   · {factor}")
    print(f"   ⚠ {api['rnd_risk']['disclaimer']}")
    print("=" * total)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Phone Number Intelligence Platform — offline analysis"
    )
    parser.add_argument("number", nargs="?", help="Phone number to look up (E.164 or national format)")
    parser.add_argument("--update", "-u", action="store_true", help="Re-download community datasets")
    parser.add_argument("--force", "-f", action="store_true", help="Force re-download even if cached")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress informational output; print JSON only")
    parser.add_argument("--json", action="store_true", help="Output JSON (same as --quiet)")
    parser.add_argument("--sources", action="store_true", help="Print data source status and exit")
    args = parser.parse_args()

    quiet = args.quiet or args.json

    if args.sources:
        statuses = get_sources_status()
        print(json.dumps(statuses, indent=2))
        return

    if args.update or args.force:
        update_data(force=args.force, quiet=quiet)
        if not args.number:
            return

    if not args.number:
        parser.print_help()
        sys.exit(1)

    if data_is_missing() and not quiet:
        print(f"Note: community datasets not found in {DATA_DIR}.")
        print("Run with --update to download them for spam/DNC analysis.\n")

    spam_data = load_spam_data()
    result = analyze_number(args.number, spam_data=spam_data)
    api_dict = to_api_dict(result)

    if quiet:
        print(json.dumps(api_dict))
    else:
        print_result_table(result)
        print()
        print("Raw JSON:")
        print(json.dumps(api_dict, indent=2))


if __name__ == "__main__":
    main()
