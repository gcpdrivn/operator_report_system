# Scraper Error Report — June 15–17, 2026

Generated: 2026-06-18  
Period: 2026-06-15 to 2026-06-17 (3 days)  
Routes monitored: 40  

---

## 1. Phase 2 — Day-wise Summary

| Date | Total | Done | Failed | Missed | OK% | Loss% |
|---|---|---|---|---|---|---|
| 2026-06-15 | 8,647 | 7,231 | 1,290 | 126 | 83.6% | 16.4% |
| 2026-06-16 | 8,605 | 7,112 | 1,385 | 108 | 82.6% | 17.4% |
| 2026-06-17 | 8,157 | 6,852 | 1,263 | 42 | 84.0% | 16.0% |
| **3-day total** | **25,409** | **21,195** | **3,938** | **276** | **83.4%** | **16.6%** |

**Definitions:**
- **Failed** — bus was due, seat layout API was called, but returned no data
- **Missed** — bus's scrape window closed before the supervisor could process it

---

## 2. Phase 2 — Total Trips Not Scraped

| Date | Missed | Failed | Total Lost |
|---|---|---|---|
| 2026-06-15 | 126 | 1,290 | 1,416 |
| 2026-06-16 | 108 | 1,385 | 1,493 |
| 2026-06-17 | 42 | 1,263 | 1,305 |
| **Total** | **276** | **3,938** | **4,214** |

Failures account for **93.4%** of all lost trips. Misses are a secondary concern.

---

## 3. Phase 1 — Coverage Gaps (routes with 0 catalog entries)

| Date | Missing Routes | Notes |
|---|---|---|
| 2026-06-15 | 2 (Delhi → Amritsar, Hyderabad → Rajahmundry) | Recovered by 8 AM recovery prescan |
| 2026-06-16 | 0 ✅ | 4 AM prescan fully covered all routes |
| 2026-06-17 | 0 ✅ | 4 AM prescan fully covered all routes |

The new 4 AM prescan + 8 AM recovery schedule eliminated Phase 1 coverage gaps from June 16 onward.

---

## 4. Route-wise Failure Distribution (3-day combined)

Sorted by total losses (failed + missed). Routes with OK% below 80% flagged ⚠️.

| Route | Total | Done | Fail | Miss | OK% |
|---|---|---|---|---|---|
| Delhi → Gorakhpur | 465 | 336 | 129 | 0 | **72.3%** ⚠️ |
| Hyderabad → Visakhapatnam | 370 | 273 | 97 | 0 | **73.8%** ⚠️ |
| Bengaluru → Mysore | 303 | 225 | 42 | 36 | **74.3%** ⚠️ |
| Ahmedabad → Mumbai | 490 | 365 | 105 | 20 | **74.5%** ⚠️ |
| Delhi → Lucknow | 1,006 | 752 | 254 | 0 | **74.8%** ⚠️ |
| Delhi → Dehradun | 689 | 533 | 143 | 13 | 77.4% |
| Surat → Mumbai | 398 | 308 | 65 | 25 | 77.4% |
| Hyderabad → Rajahmundry | 416 | 320 | 96 | 0 | 76.9% |
| Vijayawada → Tirupathi | 445 | 344 | 101 | 0 | 77.3% |
| Bengaluru → Hyderabad | 647 | 500 | 128 | 19 | 77.3% |
| Delhi → Agra | 1,025 | 813 | 211 | 1 | 79.3% |
| Vijayawada → Visakhapatnam | 529 | 427 | 88 | 14 | 80.7% |
| Ahmedabad → Surat | 842 | 680 | 140 | 22 | 80.8% |
| Surat → Ahmedabad | 1,036 | 845 | 184 | 7 | 81.6% |
| Hyderabad → Eluru | 613 | 504 | 109 | 0 | 82.2% |
| Mumbai → Surat | 713 | 588 | 121 | 4 | 82.5% |
| Delhi → Manali | 465 | 390 | 75 | 0 | 83.9% |
| Guntur → Visakhapatnam | 286 | 240 | 42 | 4 | 83.9% |
| Hyderabad → Vijayawada | 1,005 | 848 | 154 | 3 | 84.4% |
| Bangalore → Chennai | 526 | 443 | 65 | 18 | 84.2% |
| Delhi → Jaipur | 569 | 448 | 118 | 3 | 78.7% |
| Delhi → Chandigarh | 1,047 | 909 | 137 | 1 | 86.8% |
| Ahmedabad → Rajkot | 517 | 446 | 61 | 10 | 86.3% |
| Mumbai → Nashik | 487 | 423 | 64 | 0 | 86.9% |
| Delhi → Amritsar | 108 | 88 | 20 | 0 | 81.5% |
| Indore → Bhopal | 660 | 583 | 63 | 14 | 88.3% |
| Ahmedabad → Jaipur | 389 | 344 | 42 | 3 | 88.4% |
| Chennai → Tiruchirapalli | 1,618 | 1,426 | 186 | 6 | 88.1% |
| Bengaluru → Salem | 1,183 | 1,077 | 99 | 7 | 91.0% |
| Bengaluru → Vijayawada | 354 | 281 | 73 | 0 | 79.4% |
| Bangalore → Coimbatore | 567 | 494 | 68 | 5 | 87.1% |
| Bengaluru → Erode | 511 | 454 | 49 | 8 | 88.8% |
| Pune → Ahmedabad | 295 | 262 | 32 | 1 | 88.8% |
| Chennai → Coimbatore | 551 | 490 | 61 | 0 | 88.9% |
| Mumbai → Pune | 1,540 | 1,419 | 113 | 8 | 92.1% |
| Jaipur → Udaipur | 317 | 252 | 59 | 6 | 79.5% |
| Chandigarh → Delhi | 309 | 252 | 50 | 7 | 81.6% |
| Visakhapatnam → Rajahmundry | 609 | 477 | 131 | 1 | 78.3% |
| Chennai → Madurai | 1,092 | 959 | 126 | 7 | 87.8% |
| Chennai → Pondicherry | 417 | 377 | 37 | 3 | 90.4% |

---

## 5. Route-wise — Day-by-Day Failure Counts

### High-failure routes (>100 total losses over 3 days)

| Route | Jun 15 Fail/Miss | Jun 16 Fail/Miss | Jun 17 Fail/Miss |
|---|---|---|---|
| Delhi → Lucknow | 66 / 0 | 113 / 0 | 75 / 0 |
| Delhi → Agra | 68 / 1 | 82 / 0 | 61 / 0 |
| Surat → Ahmedabad | 60 / 5 | 70 / 1 | 54 / 1 |
| Chennai → Tiruchirapalli | 64 / 2 | 59 / 3 | 63 / 1 |
| Hyderabad → Vijayawada | 58 / 3 | 52 / 0 | 44 / 0 |
| Delhi → Chandigarh | 40 / 0 | 56 / 1 | 41 / 0 |
| Delhi → Gorakhpur | 36 / 0 | 57 / 0 | 36 / 0 |
| Delhi → Dehradun | 65 / 6 | 38 / 6 | 40 / 1 |
| Ahmedabad → Surat | 44 / 10 | 43 / 10 | 53 / 2 |
| Bengaluru → Hyderabad | 42 / 5 | 42 / 6 | 44 / 8 |
| Mumbai → Surat | 42 / 2 | 45 / 1 | 34 / 1 |
| Delhi → Jaipur | 42 / 1 | 44 / 2 | 32 / 0 |
| Visakhapatnam → Rajahmundry | 35 / 1 | 43 / 0 | 53 / 0 |
| Hyderabad → Eluru | 38 / 0 | 36 / 0 | 35 / 0 |
| Chennai → Madurai | 49 / 2 | 28 / 4 | 49 / 1 |
| Mumbai → Pune | 32 / 6 | 46 / 2 | 35 / 0 |
| Ahmedabad → Mumbai | 44 / 5 | 29 / 8 | 32 / 7 |

---

## 6. Hourly Error Distribution (IST, all 3 days combined)

| Hour (IST) | Due | Done | Fail | Missed | Loss% | Risk |
|---|---|---|---|---|---|---|
| 00:00–00:59 | 62 | 0 | 0 | 62 | **100.0%** | ⚠️ Supervisor not running |
| 01:00–01:59 | 20 | 0 | 0 | 20 | **100.0%** | ⚠️ Supervisor not running |
| 02:00–02:59 | 3 | 0 | 0 | 3 | **100.0%** | ⚠️ Supervisor not running |
| 03:00–03:59 | 10 | 0 | 0 | 10 | **100.0%** | ⚠️ Supervisor not running |
| 04:00–04:59 | 336 | 157 | 0 | 179 | **53.3%** | ⚠️ Supervisor starting late |
| 05:00–05:59 | 281 | 276 | 5 | 0 | 1.8% | ✅ |
| 06:00–06:59 | 237 | 227 | 10 | 0 | 4.2% | ✅ |
| 07:00–07:59 | 231 | 224 | 7 | 0 | 3.0% | ✅ |
| 08:00–08:59 | 276 | 258 | 16 | 2 | 6.5% | ✅ |
| 09:00–09:59 | 299 | 274 | 25 | 0 | 8.4% | ✅ |
| 10:00–10:59 | 306 | 274 | 32 | 0 | 10.5% | |
| 11:00–11:59 | 318 | 288 | 30 | 0 | 9.4% | |
| 12:00–12:59 | 469 | 410 | 59 | 0 | 12.6% | |
| 13:00–13:59 | 697 | 590 | 107 | 0 | 15.4% | |
| 14:00–14:59 | 875 | 771 | 104 | 0 | 11.9% | |
| 15:00–15:59 | 1,052 | 901 | 151 | 0 | 14.4% | |
| 16:00–16:59 | 1,206 | 1,053 | 153 | 0 | 12.7% | |
| 17:00–17:59 | 1,367 | 1,172 | 195 | 0 | 14.3% | |
| 18:00–18:59 | 2,032 | 1,757 | 275 | 0 | 13.5% | |
| 19:00–19:59 | 3,294 | 2,811 | 483 | 0 | 14.7% | |
| 20:00–20:59 | 3,681 | 3,088 | 593 | 0 | 16.1% | |
| 21:00–21:59 | 4,112 | 3,360 | 752 | 0 | 18.3% | ⚠️ |
| 22:00–22:59 | 3,041 | 2,435 | 606 | 0 | 19.9% | ⚠️ |
| 23:00–23:59 | 1,204 | 869 | 335 | 0 | **27.8%** | ⚠️ Peak failure hour |

---

## 7. Key Findings & Recommendations

### Finding 1 — Structural dead zone 00:00–05:00 IST
274 buses are systematically missed every day because the supervisor starts at 5 AM. Any bus with a departure between ~00:22 AM and ~04:22 AM has its `scheduled_scrape_at` in this window and is guaranteed missed. Volume is low (~91 buses/day) but the miss rate is 100%.

**Recommendation:** Consider starting the supervisor at 00:30 IST again (or extending the prescan's `window_end_at` buffer so these buses remain viable when the supervisor starts).

### Finding 2 — Failure rate escalates sharply after 21:00 IST
Loss% climbs from ~13% at 18:00 to **27.8% at 23:00**. This is correlated with RedBus's seatLayout API load — evening departures cluster heavily (4,112 buses due in the 21:00 hour alone), and the API returns empty responses under congestion.

**Recommendation:** Increase `SUPERVISOR_WORKERS` during 20:00–23:59 window, or add a retry tick for `failed` buses within 30 minutes of their original window.

### Finding 3 — 5 high-risk routes consistently below 80% OK
Delhi→Gorakhpur (72.3%), Hyderabad→Visakhapatnam (73.8%), Bengaluru→Mysore (74.3%), Ahmedabad→Mumbai (74.5%), Delhi→Lucknow (74.8%). These routes show persistent failure across all three days — not a one-day spike. Likely a combination of high bus volume per route and Akamai sensitivity on repeated same-route XHR calls.

**Recommendation:** Investigate whether adding a 1–2s extra delay between seat layout API calls for these specific routes improves success rate.

### Finding 4 — Phase 1 coverage is now stable
The 4 AM prescan + 8 AM recovery schedule has eliminated multi-route gaps. June 16 and 17 had zero missing routes at catalog build time. This is resolved.

---

*Report generated from `redbus_today_catalog` and `redbus_scraper_api_based` tables.*
*Source: `/Users/drivn/Desktop/scraper-new/output/error_report_2026-06-15_to_2026-06-17.md`*