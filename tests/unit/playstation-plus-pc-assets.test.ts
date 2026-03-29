import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaystationPlusPcAppAssetSignals } from '../../scripts/lib/playstation-plus-pc-assets.js';

test('extracts kamaji, pcnow, api, and telemetry signals from public pc-app assets', () => {
  const text = [
    'psnow.playstation.com/kamaji/api/psnow/00_09_000/',
    'kamaji/api/swordfish/00_09_000/',
    'psnow.e1-np.playstation.com/store/api/pcnow/00_09_000/container/US/en/19/STORE-MSF4078032-KRATOS/1466706897',
    'store.playstation.com/store/api/chihiro/00_09_000/container/US/en/19/IP9101-NPIA90010_01-PSNOWSUB1MOTR000/1441137756',
    'api.playstation.com/v1/users/me/lists',
    'api.playstation.com/api/v2/accounts/me/attributes',
    'smetrics.aem.playstation.com',
    'apollo2 events Click PageView UserFacingError VideoStream Impression',
    'clientSessionId streamSessionId queuePosition waitTimeEstimate closeStream accessToken subscriptionSku isMember'
  ].join('\n');

  const signals = extractPlaystationPlusPcAppAssetSignals(text);
  assert.ok(signals.hostnames.includes('psnow.playstation.com'));
  assert.ok(signals.hostnames.includes('psnow.e1-np.playstation.com'));
  assert.ok(signals.hostnames.includes('store.playstation.com'));
  assert.ok(signals.hostnames.includes('api.playstation.com'));
  assert.ok(signals.kamajiPaths.some((value) => value.includes('kamaji/api/psnow/00_09_000')));
  assert.ok(signals.kamajiPaths.some((value) => value.includes('kamaji/api/swordfish/00_09_000')));
  assert.ok(signals.pcnowPaths.some((value) => value.includes('store/api/pcnow/00_09_000/container/US/en/19/STORE-MSF4078032-KRATOS')));
  assert.ok(signals.apiPaths.some((value) => value.includes('api.playstation.com/v1/users/me/lists')));
  assert.ok(signals.apiPaths.some((value) => value.includes('store.playstation.com/store/api/chihiro/00_09_000/container/US/en/19/IP9101-NPIA90010_01-PSNOWSUB1MOTR000')));
  assert.ok(signals.hitTerms.includes('clientSessionId'));
  assert.ok(signals.hitTerms.includes('streamSessionId'));
  assert.ok(signals.hitTerms.includes('queuePosition'));
  assert.ok(signals.telemetryNamespaces.includes('apollo2'));
  assert.ok(signals.telemetryNamespaces.includes('Click'));
  assert.ok(signals.telemetryNamespaces.includes('VideoStream'));
});
