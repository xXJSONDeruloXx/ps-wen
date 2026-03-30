# Broker probe prep and PC-client launch contract notes — 2026-03-30

## Purpose

Attempt the first real `broker send` probes against a live PlayStation Plus
broker, then capture any additional evidence available even if no broker is
reachable from the current environment.

## Live broker status from this machine

Attempted from `ps-wen` on the current host:

```bash
npm run api:psn-direct -- broker
npm run api:psn-direct -- broker send testConnection --wait-ms 3000 --json
```

Observed:

- `ws://localhost:1235/` was **not reachable**
- `broker send testConnection` failed before WebSocket upgrade with:
  - `opened: false`
  - `closeCode: 1002`
  - `closeReason: "Received network error or non-101 status code."`
- no adjacent LAN hosts currently exposed port `1235` either

So no **actual** broker replay was possible from this machine during this pass.

## Direct evidence recovered anyway

Even without a live broker, the current public `apollo.js` adds several concrete
payload/signature details for the **PC client path**.

## PC-client API findings from current `apollo.js`

Source URL used for inspection:

- `https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/assets/apollo.js`

### 1. `requestClientId()` takes no params

Observed PC-client code shape:

```js
u.prototype.requestClientId=function(){
  var e=this;
  return ... new Promise(function(t){
    e.plugin.setEventHandler(function(e){
      e&&e.name===i.default.GOT_CLIENT_ID&&t()
    }),
    e.plugin.requestClientId()
  })
}
```

Implications:

- the native call itself appears to take **no argument payload**
- the meaningful data comes back asynchronously via an event
- first live replay target should remain:

```bash
npm run api:psn-direct -- broker send requestClientId --wait-ms 3000 --json
```

and likely also a target-explicit variant:

```bash
npm run api:psn-direct -- broker send requestClientId --target QAS --wait-ms 3000 --json
```

### 2. `requestClientId()` should yield three client IDs

Observed save path:

```js
u.prototype.saveClientIds=function(e){
  this.gkClientId=e.gkClientId,
  this.ps3GKClientID=e.ps3GKClientID,
  this.streamServerClientId=e.streamServerClientId
}
```

So the key expected payload/result fields are:

- `gkClientId`
- `ps3GKClientID`
- `streamServerClientId`

This is the strongest remaining missing launch prerequisite.

### 3. PC `setSettings()` expects a structured settings object

Observed PC-client plugin path:

```js
u.prototype.setPluginSettings=function(e){
  return this.plugin.setSettings(e)
}
```

And the PC build path returns an object, not a stringified JSON blob:

```js
u.prototype.buildPluginSettings=function(){
  ...
  this.pluginSettings.apolloSessionId=this.requestedGame&&this.requestedGame.apolloSessionId||"",
  this.pluginSettings.language=this.requestedGame&&this.requestedGame.language||this.pluginDefaults.language,
  this.pluginSettings.timeZone="UTC"+n,
  this.pluginSettings.summerTime=e?1:0,
  this.pluginSettings.npEnv=this.core?this.core.readRegistry("np_env"):null,
  this.pluginSettings.entitlementID=this.requestedGame&&this.requestedGame.cloudSku.entitlementId,
  this.pluginSettings.input.controllers=this.requestedGame&&this.requestedGame.controllerList,
  this.pluginSettings.platform="PC",
  this.pluginSettings.model="WINDOWS",
  this.pluginSettings.acceptButton=this.requestedGame&&this.requestedGame.acceptButton||this.pluginDefaults.acceptButton,
  "testConnection"===this.getMode()&&(delete this.pluginSettings.apolloSessionId,delete this.pluginSettings.entitlementID),
  this.pluginSettings
}
```

That is important because it suggests the likely broker payload is an **object**,
not a single string argument.

### 4. Default plugin settings are richer than the minimal examples

Observed defaults:

```js
s.prototype.pluginDefaults={
  sessionId:"",
  entitlementID:"",
  model:"orbis",
  platform:"orbis",
  clientWidth:screen.height<1080?"1280":"1920",
  clientHeight:screen.height<1080?"720":"1080",
  pullData:"1",
  language:"en",
  acceptButton:"X",
  audioChannels:"2.1",
  input:{controllers:["ds3"]},
  gkPs3AuthCode:"",
  gkCloudAuthCode:"",
  afkTimeout:60,
  forceLogout:!1,
  videoEncoderProfile:"hw4.1",
  audioEncoderProfile:"default",
  resolutionSetting:screen.height<1080?720:1080,
  simulationMode:!1,
  debug:!0,
  npEnv:"e1-np",
  adaptiveStreamMode:"pad"
}
```

For the PC path, at least these fields are overridden/added:

- `platform: "PC"`
- `model: "WINDOWS"`
- `apolloSessionId`
- `entitlementID`
- `input.controllers`
- `npEnv`
- `timeZone`
- `summerTime`

### 5. PC `requestGame()` appears to take a boolean, not a title object

Observed:

```js
u.prototype.requestGame=function(e){
  e=e||{};
  var n=!!e.forceLogout;
  return this.plugin.requestGame(n)
}
```

Implication:

- after all title/setup/auth state is staged elsewhere, the direct plugin call
  likely only receives a boolean `forceLogout`
- if the broker mirrors the plugin directly, candidate probes should include:

```json
{"command":"requestGame","params":false}
```

and perhaps:

```json
{"command":"requestGame","params":{"forceLogout":false}}
```

because it is still possible the preload layer wraps the boolean into an object.

### 6. PC auth appears to be folded into settings, not necessarily a separate call

Observed PC path:

```js
u.prototype.setPluginAuthCodes=function(e,n,a){
  this.pluginSettings.gkPs3AuthCode=n,
  this.pluginSettings.gkCloudAuthCode=e,
  this.pluginSettings.streamServerAuthCode=a,
  this.setSettings()
}
```

This is a major nuance:

- the public PC client path does **not** obviously call a native
  `plugin.setAuthCodes(...)`
- instead it mutates the settings object with:
  - `gkCloudAuthCode`
  - `gkPs3AuthCode`
  - `streamServerAuthCode`
- and then calls `setSettings()` again

That means our live probe plan should test **both** possibilities:

1. a real broker `setAuthCodes` command exists and is callable directly
2. the live PC path may actually expect auth codes to arrive via another
   `setSettings` payload

### 7. `testConnection()` is a narrower sequence than full launch

Observed PC test path:

```js
u.prototype.testConnection=function(){
  return this.setMode("testConnection"),
    this.setSettings()
      .then(this.requestClientId.bind(this))
      .then(this.getCloudAuthCode.bind(this))
      .then(this.saveCloudAuthCode.bind(this))
      .then(this.getPS3AuthCode.bind(this))
      .then(this.savePS3AuthCode.bind(this))
      .then(this.setAuthCodes.bind(this))
      .then(this.launchTestConnection.bind(this))
}
```

Notably absent in that test path:

- `getStreamServerAuthCode()`
- `requestGame()`
- `startGame()`

Implications:

- `testConnection` is a good first broker target because it is likely less
  stateful than a real launch
- the native client may tolerate missing `streamServerAuthCode` in this mode

## Best current probe matrix once the broker is live

### Baseline reachability

```bash
npm run api:psn-direct -- broker
```

### Step 1 — probe `testConnection`

```bash
npm run api:psn-direct -- broker send testConnection --wait-ms 3000 --json
npm run api:psn-direct -- broker send testConnection --target QAS --wait-ms 3000 --json
```

### Step 2 — probe `requestClientId`

```bash
npm run api:psn-direct -- broker send requestClientId --wait-ms 3000 --json
npm run api:psn-direct -- broker send requestClientId --target QAS --wait-ms 3000 --json
```

Expected evidence to watch for in replies/events:

- `gkClientId`
- `ps3GKClientID`
- `streamServerClientId`
- any `GOT_CLIENT_ID` / `PROCESS_END` style event framing

### Step 3 — probe `setSettings` with object params

Use a real owned entitlement and current Gaikai session ID. For example,
current live evidence already supports:

- `apolloSessionId` / `clientSessionId`: `artifacts/auth/gaikai-preflight.json`
- entitlement IDs from `npm run api:psn-direct -- catalog ...`

Likely object-shaped payload:

```json
{
  "sessionId": "",
  "apolloSessionId": "<gaikai client/apollo session id>",
  "entitlementID": "<owned entitlement id>",
  "model": "WINDOWS",
  "platform": "PC",
  "clientWidth": "1920",
  "clientHeight": "1080",
  "pullData": "1",
  "language": "en",
  "acceptButton": "X",
  "audioChannels": "2.1",
  "input": { "controllers": ["ds4"] },
  "gkPs3AuthCode": "",
  "gkCloudAuthCode": "",
  "afkTimeout": 60,
  "forceLogout": false,
  "videoEncoderProfile": "hw4.1",
  "audioEncoderProfile": "default",
  "resolutionSetting": 1080,
  "simulationMode": false,
  "debug": true,
  "npEnv": "e1-np",
  "adaptiveStreamMode": "pad",
  "timeZone": "<derived UTC offset>",
  "summerTime": 0
}
```

Primary probe form:

```bash
npm run api:psn-direct -- broker send setSettings '<payload-json>' --wait-ms 3000 --json
```

Secondary probe form if the broker expects routing:

```bash
npm run api:psn-direct -- broker send setSettings '<payload-json>' --target QAS --wait-ms 3000 --json
```

### Step 4 — probe auth-code staging in both plausible forms

#### Variant A — direct `setAuthCodes`

```json
{
  "gkCloudAuthCode": "<cloud code>",
  "gkPs3AuthCode": "<ps3 code>",
  "streamServerAuthCode": "<stream-server code>"
}
```

Command:

```bash
npm run api:psn-direct -- broker send setAuthCodes '<payload-json>' --wait-ms 3000 --json
```

#### Variant B — auth codes folded back into `setSettings`

Same `setSettings` payload as above, but include:

- `gkCloudAuthCode`
- `gkPs3AuthCode`
- `streamServerAuthCode`

This variant is strongly suggested by the PC-client bundle path.

## Practical conclusion

No actual broker replay happened in this pass because no live broker was
reachable.

However, the remaining launch-contract uncertainty is now narrower than before:

- `requestClientId` should be a no-arg call
- it should yield `gkClientId`, `ps3GKClientID`, and `streamServerClientId`
- PC `setSettings` likely wants an **object payload**
- PC launch may stage auth codes by **re-sending settings** rather than only by
  calling a separate `setAuthCodes`
- `requestGame` may reduce to a boolean `forceLogout` call after state is staged

So the next live broker session should start with a much tighter, evidence-led
probe matrix than the earlier blind guesses.
