import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayStationPlusObservationProvider } from '../../src/providers/playstation-plus-observation-provider.js';

test('native observation provider exposes signed-in session, bootstrap, entitlements, and placeholder allocation', async () => {
  const provider = new PlayStationPlusObservationProvider({
    pcAuthSummary: {
      generatedAt: '2026-03-29T00:00:00.000Z',
      currentAppUrl: 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/',
      likelySignedIn: true,
      cookieSurfaces: [
        {
          authLikeDomains: [
            { domain: 'psnow.playstation.com', names: ['WEBDUID', 'JSESSIONID'] },
            { domain: 'ca.account.sony.com', names: ['npsso'] }
          ]
        }
      ],
      localStorage: {
        keys: ['DUID', 'currentUser', 'locale'],
        classifiedKeys: [{ key: 'currentUser', valueClass: 'json', jsonKeys: ['accountID', 'profile'] }]
      },
      indexedDbOrigins: ['https://my.account.sony.com'],
      cachedAuthRedirects: [{ kind: 'authorization-code', path: '/app/grc-response.html' }]
    },
    pcSurfaceSummary: {
      generatedAt: '2026-03-29T00:01:00.000Z',
      shell: {
        packageName: 'playstation-now',
        runtimeVersion: '9.0.4',
        currentAppUrl: 'https://psnow.playstation.com/app/2.2.0/133/5cdcc037d/',
        preloadCommands: ['requestGame', 'startGame', 'isStreaming'],
        notifierCommands: ['requestGame', 'startGame']
      },
      ipc: {
        localWebSocket: {
          host: 'localhost',
          port: 1235,
          keepConnected: true
        },
        listeningOnLocalhost1235: true
      },
      updater: {
        metaUrl: 'https://download-psnow.playstation.com/downloads/psnow/pc/meta'
      }
    },
    pcApolloSummary: {
      generatedAt: '2026-03-29T00:02:00.000Z',
      pcSpecificKamajiPaths: ['kamaji/api/psnow/00_09_000/', 'kamaji/api/swordfish/00_09_000/'],
      pcUserApiPaths: ['gateway/lists/v1/users/me/lists', 'user/stores'],
      accountApiTemplates: ['https://accounts.<line>.api.playstation.com/api/v2/accounts/me/attributes'],
      grandCentralConfigKeys: ['clientId', 'kamajiHostUrl'],
      authFlowHints: ['createAuthCodeSession', 'kamajiSessionURL'],
      commerceHosts: ['image.api.np.km.playstation.net', 'theia.dl.playstation.net']
    },
    networkSummaries: [
      {
        generatedAt: '2026-03-29T00:03:00.000Z',
        playstationSignals: [
          'psnow.playstation.com',
          'web.np.playstation.com',
          'commerce.api.np.km.playstation.net',
          'cc.prod.gaikai.com'
        ],
        sonySignals: ['ca.account.sony.com'],
        tlsServerNames: [{ serverName: 'psnow.playstation.com', flowCount: 4, remoteIps: ['23.213.71.109'] }],
        remoteEndpoints: [
          {
            remoteIp: '23.213.71.109',
            hostnames: ['psnow.playstation.com', 'e2862.b.akamaiedge.net'],
            tcp443BytesOut: 1000,
            tcp443BytesIn: 2000,
            udp443PacketsOut: 0,
            udp443PacketsIn: 0
          }
        ]
      }
    ]
  });

  const session = await provider.detectSession();
  assert.equal(session.surface, 'native-client');
  assert.equal(session.signedIn, true);
  assert.ok(session.markers.some((marker) => marker.key === 'native-auth-domains' && marker.present));

  const bootstrap = await provider.getProfileBootstrap();
  assert.equal((bootstrap.runtime as { localhostBroker: string }).localhostBroker, 'ws://localhost:1235');
  assert.deepEqual((bootstrap.auth as { currentUserKeys: string[] }).currentUserKeys, ['accountID', 'profile']);
  assert.ok(
    (bootstrap.controlPlane as { kamajiPaths: string[] }).kamajiPaths.includes('kamaji/api/psnow/00_09_000/')
  );

  const entitlements = await provider.listEntitlements();
  const streamingEntitlement = entitlements.find((entry) => entry.id === 'playstation-plus-premium-streaming');
  assert.equal(streamingEntitlement?.state, 'gated');
  assert.ok(streamingEntitlement?.evidence?.includes('commerce.api.np.km.playstation.net'));

  const allocation = await provider.allocate({
    titleId: 'CUSA00001',
    regionPreference: 'us',
    qualityPreference: '1080p'
  });
  assert.equal(allocation.state, 'placeholder');
  assert.equal(allocation.sessionId, 'placeholder:CUSA00001');
  assert.ok(allocation.endpointHints?.includes('psnow.playstation.com'));
  assert.ok(allocation.endpointHints?.includes('cc.prod.gaikai.com'));

  const status = await provider.getStatus();
  assert.equal(status.capabilities.nativeBroker.state, 'observed');
  assert.equal(status.capabilities.entitlements.state, 'gated');
  assert.equal(status.capabilities.sessionAllocation.state, 'placeholder');
  assert.equal(status.app.localhostBrokerUrl, 'ws://localhost:1235');
});

test('browser auth summary takes precedence when present and query path returns a placeholder error', async () => {
  const provider = new PlayStationPlusObservationProvider({
    browserAuthSummary: {
      generatedAt: '2026-03-29T00:04:00.000Z',
      currentUrl: 'https://www.playstation.com/en-us/playstation-network/',
      likelySignedIn: true,
      onSigninSurface: false,
      cookieDomains: [{ domain: 'my.account.sony.com', authLikeNames: ['KP_uIDz'] }],
      originStorage: {
        'https://www.playstation.com': {
          localStorageKeys: ['userId'],
          sessionStorageKeys: ['gpdcUser']
        }
      }
    },
    pcAuthSummary: {
      generatedAt: '2026-03-29T00:00:00.000Z',
      likelySignedIn: false
    }
  });

  const session = await provider.detectSession();
  assert.equal(session.surface, 'playstation.com');
  assert.equal(session.signedIn, true);
  assert.equal(session.profileHints?.userIdPresent, true);
  assert.equal(session.profileHints?.handlePresent, true);

  const query = await provider.executePersistedQuery({ operationName: 'getPurchasedGameList' });
  assert.match(query.errors?.[0]?.message ?? '', /No live read\/query provider is wired/);
});
