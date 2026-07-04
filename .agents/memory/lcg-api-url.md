---
name: LocalCallingGuide NPA-NXX API
description: Correct URL and XML structure for LocalCallingGuide.com's free NPA-NXX enrichment API
---

## Rule
The correct LCG API endpoint is `xmlprefix.php`, NOT `lca_prefix.php`.

URL: `https://www.localcallingguide.com/xmlprefix.php?npa=NPA&nxx=NXX`

`lca_prefix.php` returns a full HTML page. `xmlprefix.php` returns XML.

## XML structure
Returns one `<prefixdata>` element per 1000-number block (x=0..9):
```xml
<prefixdata>
  <npa>415</npa><nxx>200</nxx><x>9</x>
  <rc>San Francisco: Central DA</rc>
  <region>CA</region>          <!-- US state abbreviation -->
  <ocn>6529</ocn>
  <company-name>T-MOBILE USA, INC.</company-name>
  <company-type>W</company-type>  <!-- C=CLEC I=ILEC R=RBOC W=WIRELESS B=Cable P=Paging -->
  <ilec-name>PACIFIC BELL</ilec-name>
  <lata>722</lata>
</prefixdata>
```

## Cache key strategy
- Cache key = `NPANXXB` e.g. `415200_9` (NPA+NXX underscore block digit)
- Fetch all 10 blocks in one HTTP call, cache all in one write
- Misses are in-memory only (`_NPANXX_MISS_SET`) — not persisted — so transient LCG failures recover on next process start
- Cache writes use atomic rename + fcntl advisory lock to prevent concurrent subprocess races

**Why:** The batch API endpoint spawns up to 10 Python subprocesses; without locking and atomic writes, concurrent writes to the same JSON file cause corruption. Without ephemeral miss tracking (instead of persisted `{}`), a temporary LCG outage permanently poisons the cache until manual cleanup.
