# Kamaji category sweep — 2026-03-30

## Goal

Use the standalone guest Kamaji session to enumerate real game inventory from the
store/catalog API without launching the PlayStation Plus app.

## Method

A single guest session was established from the NPSSO using:

- `POST /kamaji/api/pcnow/00_09_000/user/session`
- body: `country_code=US&language_code=en&date_of_birth=1981-01-01`

A bearer token was also minted from the `entitlements` OAuth client and used
alongside the guest `JSESSIONID` + `WEBDUID` to query store containers.

Results saved locally to:
- `artifacts/api/kamaji-category-sweep.json`

## Confirmed live category containers

### `STORE-MSF192018-APOLLOMUSTPLAY`

- name: `Must Play`
- links returned: `3`

Observed products:
- `UP9000-CUSA08966_00-DAYSGONECOMPLETE` — **Days Gone**
- `UP0001-CUSA09311_00-GAME000000000000` — **Assassin's Creed® Odyssey**
- `UP9000-CUSA07408_00-00000000GODOFWAR` — **God of War**

### `STORE-MSF192018-APOLLO_ACTION`

- name: `Action`
- links returned: `21`

Observed products:
- `UP0082-CUSA16704_00-DXM0000000000001` — **Marvel's Guardians of the Galaxy PS4 & PS5**
- `UP0001-CUSA15717_00-FC6EDSTANDARD000` — **Far Cry 6: Standard Edition PS4 & PS5**
- `UP0082-CUSA01799_00-DXMANKINDIVIDED0` — **Deus Ex: Mankind Divided**
- `UP0115-CUSA02134_00-KFGAME0000000001` — **Killing Floor 2**
- `UP5180-CUSA15961_00-0000000000000000` — **Lonely Mountains: Downhill**
- `UP3864-CUSA09267_00-AHATINTIMEPS4000` — **A Hat in Time**
- `UP0082-CUSA00252_00-B000000000000261` — **Thief**
- `UP3824-CUSA23349_00-PP2BASEGAME00001` — **PAW Patrol Mighty Pups Save Adventure Bay**

### `STORE-MSF192018-APOLLOPS3GAMES`

- name: `PS3`
- links returned: `23`

Observed products:
- `UP0082-CUSA00107_00-000000TOMBRAIDER` — **Tomb Raider: Definitive Edition**
- `UP0082-CUSA05794_00-RISEOFTOMBRAIDER` — **Rise of the Tomb Raider: 20 Year Celebration**
- `UP1003-CUSA02218_00-DISHONOREDGAMENA` — **Dishonored® Definitive Edition**
- `UP9000-BCUS98132_00-HEAVENLYSWORD000` — **Heavenly Sword™**
- `UP9000-NPUA80643_00-RC1REMASTER00100` — **Ratchet & Clank®**
- `UP9000-NPUA80644_00-RC2REMASTER00100` — **Ratchet & Clank®: Going Commando**
- `UP9000-NPUA80645_00-RC3REMASTER00100` — **Ratchet & Clank®: Up Your Arsenal**
- `UP9000-NPUA80646_00-RC4REMASTER00101` — **Ratchet: Deadlocked™**

### `STORE-MSF192018-APOLLOREMASTERS`

- name: `Remasters`
- links returned: `22`

Observed products:
- `UP2038-CUSA14355_00-RTYPEDIMENSIONSA` — **R-Type Dimensions EX**
- `UP0082-CUSA00107_00-000000TOMBRAIDER` — **Tomb Raider: Definitive Edition**
- `UP1003-CUSA02218_00-DISHONOREDGAMENA` — **Dishonored® Definitive Edition**
- `UP1003-CUSA05333_00-SKYRIMHDFULLGAME` — **The Elder Scrolls V: Skyrim Special Edition - PS4 & PS5**
- `UP9000-NPUA80643_00-RC1REMASTER00100` — **Ratchet & Clank®**
- `UP9000-NPUA80644_00-RC2REMASTER00100` — **Ratchet & Clank®: Going Commando**
- `UP9000-NPUA80645_00-RC3REMASTER00100` — **Ratchet & Clank®: Up Your Arsenal**
- `UP9000-CUSA00552_00-THELASTOFUS00000` — **The Last Of Us™ Remastered**

### `STORE-MSF192018-APOLLOKIDSFAMILY`

- name: `Kids & Family`
- links returned: `16`

Observed products:
- `UP1018-CUSA00580_00-LEGOBATMANTHREE0` — **LEGO® Batman™ 3: Beyond Gotham**
- `UP5180-CUSA15961_00-0000000000000000` — **Lonely Mountains: Downhill**
- `UP3181-CUSA32293_00-9560942154590336` — **Hundred Days - Winemaking Simulator**
- `UP3864-CUSA13967_00-APP0990000000022` — **Forager**
- `UP3824-CUSA23349_00-PP2BASEGAME00001` — **PAW Patrol Mighty Pups Save Adventure Bay**
- `UP3824-CUSA27964_00-0502404476208395` — **My Friend Peppa Pig**
- `UP0751-CUSA14150_00-HUMANITYGAME0000` — **HUMANITY**
- `UP1023-CUSA26005_00-0000000000000000` — **STORY OF SEASONS: Friends of Mineral Town**

## What this proves

1. The store/catalog API is live and usable with a guest Kamaji session.
2. The game inventory includes concrete Sony content IDs (`UPxxxx-CUSA...` and
   `UP9000-NPUA...`) and full product names.
3. The service is not just exposing container metadata — it returns real game
   records suitable for:
   - catalog browsing
   - title ID extraction
   - category inventory
   - future launch-target mapping
4. PS3-era remasters and legacy titles are mixed into modern category trees.
5. The OSS CLI can now browse real PlayStation cloud catalog structure without
   needing the Windows app running.

## Immediate implications for the CLI

The CLI now has enough to support:

- `catalog --cat <CONTAINER_ID>` for browsing real game containers
- title ID extraction (`UPxxxx-CUSA...` style IDs)
- container-to-title mapping for launch experiments
- a future `search` command once the exact search parameter format is found
- a future `catalog tree` command starting from `STORE-MSF192018-APOLLOROOT`

## Next

1. Sweep the remaining APOLLO category containers (`Adventure`, `Shooter`, `RPG`,
   `Simulation`, alphabetical ranges, etc.)
2. Follow the returned product/container URLs to capture product-detail shapes
3. Determine the correct search parameter format for `store/api/.../search/...`
4. Compare guest-session catalog responses against recognized-session responses
   once the account-linking step is solved
