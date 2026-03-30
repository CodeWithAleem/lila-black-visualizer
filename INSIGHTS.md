# Three Insights from LILA BLACK Player Data

## Insight 1: Combat Is Heavily Concentrated in Two Map Quadrants — Most of the Map Goes Unused

**What caught my eye:** Using the kill heatmap overlay on AmbroseValley, a stark pattern emerged — virtually all combat (60% of kills) clusters in just 2 of 16 grid zones: the center-west and center-southwest quadrants. The eastern half of the map has almost zero combat activity.

**Supporting data:**
- AmbroseValley Grid(1,2): **727 combat events** (31.8% of all kills on the map)
- AmbroseValley Grid(1,1): **638 combat events** (27.9%)
- Combined, these two zones account for **59.7%** of all combat on the map's most-played map
- The same pattern holds on Lockdown: Grid(2,2) and Grid(1,1) account for **56.7%** of kills
- Eastern quadrants on all three maps show near-zero kill activity

**Actionable insight:** The eastern portions of all three maps are functionally dead zones — players don't fight there, don't traverse there, and don't loot there meaningfully. This suggests either (a) loot placement doesn't incentivize exploration of those areas, (b) the storm direction consistently pushes players west/southwest, or (c) spawn points cluster on the western side.

**What to do:**
- **Add high-value loot or objectives** in the underused eastern zones to draw players across the full map
- **Vary storm direction** across matches so players can't predict safe routing patterns
- **Track "map utilization rate"** as a KPI: % of 4×4 grid cells that see ≥5 combat events per day. Current rate is roughly 25-30%. Target: 50%+.

**Why a level designer should care:** If 70% of your carefully designed map geometry never sees player interaction, that's wasted development effort. More importantly, experienced players will learn "just go center-west" as a meta-strategy, making matches predictable and reducing replayability.

---

## Insight 2: Player Retention Drops Catastrophically — 84% of Day-1 Players Don't Return on Day 2

**What caught my eye:** Tracking unique human player IDs across the 5-day window revealed a severe retention cliff. The tool's date filter made this immediately visible — switching between days showed dramatically fewer player paths on the map.

**Supporting data:**
- **Feb 10:** 98 unique human players
- **Feb 11:** 81 players, but only **16 returning** from Day 1 (16.3% D1 retention)
- **Feb 12:** 59 players, only **12** from Day 1 (12.2%)
- **Feb 13:** 47 players, only **4** from Day 1 (4.1%)
- **Feb 14:** 12 players, only **2** from Day 1 (2.0%)
- Total matches dropped from **285** (Feb 10) → **37** (Feb 14)
- The ratio of bots-to-humans in matches is extremely high: most matches have **1 human + 7-15 bots**

**Actionable insight:** The data shows two compounding problems: (1) very few players return after their first session, and (2) the matchmaking fills lobbies overwhelmingly with bots to compensate for low player counts. This creates a feedback loop — players face mostly bots, the experience feels hollow, so they don't come back.

**What to do:**
- **Reduce bot ratio** in matches with human players. Even if lobby sizes shrink, fighting 3 real humans is more engaging than fighting 14 bots.
- **Add first-session hooks** — guided loot paths, guaranteed exciting encounters in the first match, visible progression rewards.
- **Track D1→D2 retention** as the primary health metric. Current: ~16%. Industry benchmark for mobile shooters: 30-40%.
- **A/B test lobby composition** — does a 4-human/6-bot lobby retain better than 1-human/14-bot?

**Why a level designer should care:** Low retention means your map iterations get almost no repeat-player feedback. Players never learn the map well enough to develop preferences, routing strategies, or discover hidden areas. The map design can't evolve based on deep player behavior if nobody plays more than twice.

---

## Insight 3: PvP Combat Is Virtually Non-Existent — 99.8% of Kills Are Against Bots

**What caught my eye:** Filtering the match event data by type, I found that across the entire 5-day dataset with 89,000 events, there are only **3 human-vs-human kills** and **3 corresponding human deaths**. Meanwhile, there are **2,415 bot kills** and **700 deaths-to-bots**. The kill heatmap is entirely bot-combat.

**Supporting data:**
- `Kill` events (human kills human): **3** total across 5 days
- `BotKill` events (human kills bot): **2,415**
- `BotKilled` events (bot kills human): **700**
- `KilledByStorm` events: **39**
- Human kill-to-death ratio against bots: **3.45:1** (bots are too easy)
- PvP encounters as % of all combat: **0.19%**

**Actionable insight:** LILA BLACK is functionally a PvE game right now, not a competitive extraction shooter. This is likely a consequence of Insight #2 — there simply aren't enough concurrent human players to create PvP encounters. But the 3.45:1 K/D ratio against bots also suggests bots are too passive or predictable, making combat low-stakes.

**What to do:**
- **Increase bot AI difficulty** — bots should occasionally win firefights to create tension. A 3.45:1 ratio means players almost never feel threatened.
- **Create PvP incentive zones** — high-value loot areas that are too dangerous for bots to reach, forcing human players into contested spaces.
- **Track "PvP engagement rate"** — % of matches where at least one human-vs-human kill occurs. Current: effectively 0%. Target: 15%+ once player count grows.
- **Storm deaths (39 total)** are also very low — consider making the storm more aggressive to force more encounters in late-game scenarios.

**Why a level designer should care:** Map design for PvE and PvP are fundamentally different. If the game is unintentionally PvE, then sightlines, cover placement, choke points, and flanking routes are all being wasted — bots don't use them intelligently. Understanding that your real "enemy" for players is currently bots (not other humans) should change how you think about encounter design, loot placement, and map flow.
