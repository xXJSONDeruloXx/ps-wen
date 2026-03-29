import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaystationPlusPcApolloSummary } from '../../scripts/lib/playstation-plus-pc-apollo.js';

test('extracts structured PC-app Apollo endpoint/config hints', () => {
  const text = `
    GrandCentral.setConfig({duid:createDuid('0007','0040'),clientId:e,kamajiHostUrl:i,kamajiEnv:t.default.APP.line,psnUsername:t.default.APP.username,
      psnPassword:t.default.APP.password,kamajiEventsUrl:n.default.get('eventsURL'),kamajiEventsBatchLimit:t.default.APP.eventsBatchLimit,kamajiEventsTransmitInterval:t.default.APP.eventsTransmitInterval})
    sessionURL:function(){var e=i.default.get('kamajiSessionURL');if('useSessionURL'===e){return this.get('userSession').getData().sessionUrl}return e}.property(),
    createPlatformSession:function(){return this.get('userSession').createAuthCodeSession()},
    signIn:function(e,n){return i.promptSignIn(e,r)},
    fullPageSignIn:function(e){return n.redirectSignIn(i)},
    myListUrl:t.default.computed('line',function(){if(e===l.PS4){return 'https://lists.'+("np"===this.get('line')?'':this.get('line')+'.')+'api.playstation.com/v1/users/me/lists'}if(e===l.PC)return this.get('kamajiHostURL')+'gateway/lists/v1/users/me/lists'}),
    accountAttributesUrl:t.default.computed('line',function(){return 'https://accounts.'+("np"===this.get('line')?'':this.get('line')+'.')+'api.playstation.com/api/v2/accounts/me/attributes'}),
    guestBannerURL:t.default.computed('line','locale',function(){return 'https://merchandise'+e+'.api.playstation.com/v1/channels/19/contexts/'+l.Banners}),
    userBannerURL:t.default.computed('line',function(){return 'https://merchandise'+e+'.api.playstation.com/v1/users/me/channels/19/contexts/'+l.Banners}),
    requestUserStores:function(){var n=this.get('kamajiHostURL')+'user/stores';},
    var x='https://psnow.playstation.com/kamaji/api/'+this.get('serviceType')+'/00_09_000/';
    var y='kamaji/api/swordfish/00_09_000/';
    var z='activity.api.{{env}}.km.playstation.net';
    var q='commerce1.api.{{env}}.km.playstation.net';
    var s='apollo2.e1-np.ac.playstation.net';
    var sm='smetrics.aem.playstation.com';
  `;

  const summary = extractPlaystationPlusPcApolloSummary(text);
  assert.deepEqual(summary.grandCentralConfigKeys, [
    'clientId',
    'duid',
    'kamajiEnv',
    'kamajiEventsBatchLimit',
    'kamajiEventsTransmitInterval',
    'kamajiEventsUrl',
    'kamajiHostUrl',
    'psnPassword',
    'psnUsername'
  ]);
  assert.ok(summary.kamajiBasePaths.some((value) => value.includes('/kamaji/api/')));
  assert.ok(summary.pcSpecificKamajiPaths.some((value) => value.includes('kamaji/api/swordfish/00_09_000/')));
  assert.ok(summary.pcSpecificKamajiPaths.some((value) => value.includes('psnow.playstation.com/kamaji/api/')));
  assert.ok(summary.pcUserApiPaths.includes('gateway/lists/v1/users/me/lists'));
  assert.ok(summary.pcUserApiPaths.includes('user/stores'));
  assert.ok(summary.accountApiTemplates.some((value) => value.includes('api.playstation.com/v1/users/me/lists')));
  assert.ok(summary.accountApiTemplates.some((value) => value.includes('api.playstation.com/api/v2/accounts/me/attributes')));
  assert.ok(summary.accountApiTemplates.some((value) => value.includes('api.playstation.com/v1/channels/19/contexts')));
  assert.ok(summary.accountApiTemplates.some((value) => value.includes('api.playstation.com/v1/users/me/channels/19/contexts')));
  assert.ok(summary.commerceHosts.includes('activity.api.{{env}}.km.playstation.net'));
  assert.ok(summary.commerceHosts.includes('commerce1.api.{{env}}.km.playstation.net'));
  assert.ok(summary.commerceHosts.includes('apollo2.e1-np.ac.playstation.net'));
  assert.deepEqual(summary.telemetryHosts, ['smetrics.aem.playstation.com']);
  assert.deepEqual(summary.authFlowHints, [
    'accountAttributesUrl',
    'createAuthCodeSession',
    'kamajiSessionURL',
    'myListUrl',
    'promptSignIn',
    'redirectSignIn',
    'requestUserStores',
    'useSessionURL'
  ]);
});
