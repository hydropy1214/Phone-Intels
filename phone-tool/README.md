# Phone Tool — Offline Phone Number Intelligence

A single-file Python CLI that looks up intelligence on a phone number using
only locally stored data. No paid API providers (Twilio, Numverify, etc.) are
used or required.

## Setup

```bash
cd phone-tool
pip install -r requirements.txt
```

## Usage

```bash
python phone_tool.py +14155552671
```

On first run, the tool automatically downloads small local datasets into the
`data/` folder. After that, it runs completely offline.

Refresh the local datasets at any time:

```bash
python phone_tool.py --update
```

Use your own data files instead of the bundled ones:

```bash
python phone_tool.py +14155552671 --spam-file my_spam.csv --dnc-file my_dnc.csv --rnd-file my_rnd.txt
```

Print JSON in addition to the table:

```bash
python phone_tool.py +14155552671 --json
```

## What each field means

| Field | Source | Notes |
|---|---|---|
| Line Type, Carrier | `phonenumbers` bundled metadata | Fully offline |
| Country / Region / City | `phonenumbers` bundled geocoder | Fully offline, approximate (based on number ranges, not GPS) |
| Spam / Abuse | Community-maintained public lists (GitHub/GitLab) | Best-effort; lists may be incomplete or stale |
| Do Not Call (DNC) / Do Not Disturb (DND) | Local sample file | **Important:** the real FTC Do Not Call Registry has no free bulk download — it's only available to paid telemarketer subscribers via donotcall.gov. This tool ships a small illustrative sample so the field works end-to-end; bring your own export with `--dnc-file` for real data. |
| Reassigned Number | Open-source RND sample/mirror, or local placeholder | The official FCC Reassigned Numbers Database requires a paid subscription at reassigned.us; this uses a free community sample instead. |
| Active / Reachable | N/A | Determining this requires a live HLR (Home Location Register) network query, which is impossible to do offline. Always shown as "N/A (requires HLR)". |
| Prepaid / Postpaid | N/A | Not available from any free offline dataset. |
| Ported | N/A | Number portability data is not publicly available for free. |
| Fraud Score | Local heuristic | Combines validity, spam-list hits, reassigned-list hits, DNC-list hits, and line type (VoIP/premium-rate) into a 0-100 score. This is a heuristic, not a guarantee. |

## Getting real DNC / RND data

- **Do Not Call Registry**: telemarketers can purchase area-code data exports
  at https://www.donotcall.gov/ (requires an account and fee). Export it as
  CSV and pass it with `--dnc-file`.
- **Reassigned Numbers Database**: subscribe at https://www.reassigned.us/ to
  query or download the full authoritative dataset, then pass an export with
  `--rnd-file`.

## Files

- `phone_tool.py` — the CLI tool (single script)
- `requirements.txt` — `phonenumbers` + `requests`
- `data/` — downloaded/cached local datasets (created automatically)
