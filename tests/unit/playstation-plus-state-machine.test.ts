import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialPlayStationPlusFlowState,
  deriveFlowPhaseFromPrototypeStatus,
  transitionPlayStationPlusFlowState
} from '../../src/prototype/playstation-plus-state-machine.js';
import type { PlayStationPlusPrototypeStatus } from '../../src/providers/playstation-plus-observation-provider.js';

function makeStatus(overrides: Partial<PlayStationPlusPrototypeStatus> = {}): PlayStationPlusPrototypeStatus {
  return {
    generatedAt: '2026-03-29T00:10:00.000Z',
    session: {
      capturedAt: '2026-03-29T00:10:00.000Z',
      surface: 'native-client',
      signedIn: true,
      markers: []
    },
    app: {
      packageName: 'playstation-now',
      runtimeVersion: '9.0.4',
      currentAppUrl: 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/',
      localhostBrokerUrl: 'ws://localhost:1235',
      preloadCommandCount: 50,
      notifierCommandCount: 38
    },
    hosts: {
      captured: ['psnow.playstation.com', 'web.np.playstation.com'],
      accountAndCommerce: ['checkout.playstation.com'],
      streamingLineage: ['psnow.playstation.com', 'cc.prod.gaikai.com']
    },
    capabilities: {
      login: {
        state: 'observed',
        evidence: ['cookie:native-auth-domains'],
        notes: ['signed in']
      },
      nativeBroker: {
        state: 'observed',
        evidence: ['ws://localhost:1235'],
        notes: []
      },
      profileBootstrap: {
        state: 'observed',
        evidence: ['accountID'],
        notes: []
      },
      entitlements: {
        state: 'gated',
        evidence: ['checkout.playstation.com'],
        notes: ['gated']
      },
      sessionAllocation: {
        state: 'placeholder',
        evidence: ['psnow.playstation.com'],
        notes: ['placeholder']
      },
      streamingTransport: {
        state: 'unknown',
        evidence: [],
        notes: []
      }
    },
    nextSteps: ['placeholder launch UX'],
    ...overrides
  };
}

test('flow state moves through browser login open, confirmation, and synchronized provider phases', () => {
  const opened = transitionPlayStationPlusFlowState(createInitialPlayStationPlusFlowState('2026-03-29T00:00:00.000Z'), {
    type: 'open-browser-login',
    at: '2026-03-29T00:01:00.000Z',
    mode: 'system-browser',
    loginUrl: 'https://web.np.playstation.com/api/session/v1/signin',
    waitSeconds: 600
  });
  assert.equal(opened.phase, 'browser-login-opened');
  assert.equal(opened.browserLogin.mode, 'system-browser');
  assert.equal(opened.browserLogin.waitSeconds, 600);
  assert.match(opened.nextActions[0] ?? '', /Complete sign-in/);

  const confirmed = transitionPlayStationPlusFlowState(opened, {
    type: 'confirm-browser-login',
    at: '2026-03-29T00:02:00.000Z',
    note: 'already logged in'
  });
  assert.equal(confirmed.phase, 'browser-login-confirmed');
  assert.equal(confirmed.browserLogin.confirmationNote, 'already logged in');

  const synced = transitionPlayStationPlusFlowState(confirmed, {
    type: 'sync-provider-status',
    at: '2026-03-29T00:03:00.000Z',
    status: makeStatus()
  });
  assert.equal(synced.phase, 'allocation-placeholder');
  assert.equal(synced.lastObservation?.signedIn, true);
  assert.equal(synced.lastObservation?.entitlementsState, 'gated');
  assert.equal(synced.lastObservation?.sessionAllocationState, 'placeholder');
  assert.match(synced.nextActions[0] ?? '', /allocate/);
  assert.equal(synced.history.length, 3);
});

test('deriveFlowPhaseFromPrototypeStatus preserves lower-confidence stages when capabilities are missing', () => {
  const signedOutStatus = makeStatus({
    session: {
      capturedAt: '2026-03-29T00:10:00.000Z',
      surface: 'unknown',
      signedIn: false,
      markers: []
    },
    capabilities: {
      ...makeStatus().capabilities,
      login: { state: 'unknown', evidence: [], notes: [] },
      entitlements: { state: 'unknown', evidence: [], notes: [] },
      sessionAllocation: { state: 'unknown', evidence: [], notes: [] }
    }
  });
  assert.equal(deriveFlowPhaseFromPrototypeStatus(signedOutStatus), 'signed-out');

  const signedInStatus = makeStatus({
    capabilities: {
      ...makeStatus().capabilities,
      entitlements: { state: 'unknown', evidence: [], notes: [] },
      sessionAllocation: { state: 'unknown', evidence: [], notes: [] }
    }
  });
  assert.equal(deriveFlowPhaseFromPrototypeStatus(signedInStatus), 'signed-in-observed');

  const gatedStatus = makeStatus({
    capabilities: {
      ...makeStatus().capabilities,
      sessionAllocation: { state: 'unknown', evidence: [], notes: [] }
    }
  });
  assert.equal(deriveFlowPhaseFromPrototypeStatus(gatedStatus), 'entitlements-gated');
});

test('reset returns the flow to signed-out', () => {
  const advanced = transitionPlayStationPlusFlowState(createInitialPlayStationPlusFlowState(), {
    type: 'sync-provider-status',
    status: makeStatus()
  });
  const reset = transitionPlayStationPlusFlowState(advanced, {
    type: 'reset',
    at: '2026-03-29T00:04:00.000Z'
  });

  assert.equal(reset.phase, 'signed-out');
  assert.equal(reset.lastObservation, null);
  assert.deepEqual(reset.browserLogin, {});
  assert.equal(reset.history.at(-1)?.event, 'reset');
});
