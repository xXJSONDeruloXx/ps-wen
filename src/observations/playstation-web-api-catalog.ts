export type WebApiProbe = {
  id: string;
  kind: 'json' | 'graphql';
  preferredOrigins: string[];
  request: {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    redirect?: 'follow' | 'manual';
  };
  notes: string;
};

const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';

export const PLAYSTATION_WEB_API_PROBES: WebApiProbe[] = [
  {
    id: 'io.user.details',
    kind: 'json',
    preferredOrigins: ['https://www.playstation.com/en-us/playstation-network/', 'https://www.playstation.com/en-us/support/'],
    request: {
      url: 'https://io.playstation.com/user/details',
      method: 'GET'
    },
    notes: 'Observed on signed-in PlayStation.com pages; returns basic user/profile details.'
  },
  {
    id: 'io.user.segments',
    kind: 'json',
    preferredOrigins: ['https://www.playstation.com/en-us/playstation-network/', 'https://www.playstation.com/en-us/support/'],
    request: {
      url: 'https://io.playstation.com/user/segments',
      method: 'GET'
    },
    notes: 'Observed on signed-in PlayStation.com pages; returns segment map data.'
  },
  {
    id: 'graphql.getCartItemCount',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest', 'https://www.playstation.com/en-us/playstation-network/'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'getCartItemCount'
      },
      body: {
        operationName: 'getCartItemCount',
        variables: {},
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '98136bcbc72e0fefccd8ecd6d3b3309225a6889c19df6e54581d86ff1c15d88a'
          }
        }
      }
    },
    notes: 'Observed in browser resource URLs; currently returns a schema error in direct replay tests.'
  },
  {
    id: 'graphql.getProfileOracle',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest', 'https://www.playstation.com/en-us/playstation-network/'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'getProfileOracle'
      },
      body: {
        operationName: 'getProfileOracle',
        variables: {},
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'fc0d765f537f3dce3e0d91c71e85daa401042ba43066acde9f8f584faced10df'
          }
        }
      }
    },
    notes: 'Observed in browser resource URLs; currently returns a schema error in direct replay tests.'
  },
  {
    id: 'graphql.queryOracleUserProfileFullSubscription',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest', 'https://www.playstation.com/en-us/playstation-network/'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'queryOracleUserProfileFullSubscription'
      },
      body: {
        operationName: 'queryOracleUserProfileFullSubscription',
        variables: {},
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '3fe5e3cb6e16f83be98ccaa694823e10bdf428f9c7ff8e314b8464ad8976319d'
          }
        }
      }
    },
    notes: 'Observed in browser resource URLs; currently returns a schema error in direct replay tests.'
  },
  {
    id: 'graphql.storeRetrieveWishlist',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest', 'https://www.playstation.com/en-us/playstation-network/'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'storeRetrieveWishlist'
      },
      body: {
        operationName: 'storeRetrieveWishlist',
        variables: {},
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '1fa88dd6c70279e3d914f7ba535b2558a7e45821d030cb2a63a8e450963d12c3'
          }
        }
      }
    },
    notes: 'Observed in browser resource URLs; returns wishlist data on the Store surface.'
  },
  {
    id: 'graphql.wcaPlatformVariantsRetrive',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'wcaPlatformVariantsRetrive'
      },
      body: {
        operationName: 'wcaPlatformVariantsRetrive',
        variables: { entityTag: null },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '264beeb7a7f3c8c4d245cfebc308756b5c95ae066bb0dbc09a4bb5fa2d7d7295'
          }
        }
      }
    },
    notes: 'Observed on the Store surface; returns experiment/platform-variant data.'
  },
  {
    id: 'graphql.getPurchasedGameList',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest', 'https://www.playstation.com/en-us/playstation-network/'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'getPurchasedGameList'
      },
      body: {
        operationName: 'getPurchasedGameList',
        variables: {
          isActive: true,
          platform: ['ps4', 'ps5'],
          size: 25,
          start: 0,
          sortBy: 'ACTIVE_DATE',
          sortDirection: 'desc'
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '827a423f6a8ddca4107ac01395af2ec0eafd8396fc7fa204aaf9b7ed2eefa168'
          }
        }
      }
    },
    notes: 'Observed in browser resource URLs; direct replay currently returns an access-denied GraphQL error.'
  },
  {
    id: 'graphql.schema.queryType',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'SchemaRootProbe'
      },
      body: {
        operationName: 'SchemaRootProbe',
        query: 'query SchemaRootProbe { __schema { queryType { name } } }'
      }
    },
    notes: 'Controlled introspection probe to see whether GraphQL schema introspection is enabled.'
  },
  {
    id: 'graphql.schema.userProfilesRetrieve',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'UserProfilesRetrieveProbe'
      },
      body: {
        operationName: 'UserProfilesRetrieveProbe',
        query: 'query UserProfilesRetrieveProbe { userProfilesRetrieve { __typename } }'
      }
    },
    notes: 'Controlled schema-hint probe based on server suggestions from stale profile-oracle queries.'
  },
  {
    id: 'graphql.schema.userPresenceRetrieve',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'UserPresenceRetrieveProbe'
      },
      body: {
        operationName: 'UserPresenceRetrieveProbe',
        query: 'query UserPresenceRetrieveProbe { userPresenceRetrieve { __typename } }'
      }
    },
    notes: 'Controlled schema-hint probe based on server suggestions from stale profile-oracle queries.'
  },
  {
    id: 'graphql.schema.psDirectCartRetrieve',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'PsDirectCartRetrieveProbe'
      },
      body: {
        operationName: 'PsDirectCartRetrieveProbe',
        query: 'query PsDirectCartRetrieveProbe { psDirectCartRetrieve { __typename } }'
      }
    },
    notes: 'Controlled schema-hint probe based on server suggestions from stale cart queries.'
  },
  {
    id: 'graphql.schema.purchasedTitlesRetrieve',
    kind: 'graphql',
    preferredOrigins: ['https://store.playstation.com/en-us/pages/latest'],
    request: {
      url: GRAPHQL_URL,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-apollo-operation-name': 'PurchasedTitlesRetrieveProbe'
      },
      body: {
        operationName: 'PurchasedTitlesRetrieveProbe',
        query: 'query PurchasedTitlesRetrieveProbe { purchasedTitlesRetrieve { __typename } }'
      }
    },
    notes: 'Controlled schema-hint probe against a field name seen in access-denied persisted-query responses.'
  },
  {
    id: 'session.redirect.session',
    kind: 'json',
    preferredOrigins: ['https://www.playstation.com/en-us/playstation-network/'],
    request: {
      url: 'https://web.np.playstation.com/api/session/v1/session?redirect_uri=https%3A%2F%2Fwww.playstation.com%2Fen-us%2Fplaystation-network%2F',
      method: 'GET',
      redirect: 'manual'
    },
    notes: 'Observed from the browser login flow; manual redirect probe to confirm redirect-oriented session orchestration.'
  },
  {
    id: 'session.redirect.signin',
    kind: 'json',
    preferredOrigins: ['https://www.playstation.com/en-us/playstation-network/'],
    request: {
      url: 'https://web.np.playstation.com/api/session/v1/signin?redirect_uri=https%3A%2F%2Fwww.playstation.com%2Fen-us%2Fplaystation-network%2F',
      method: 'GET',
      redirect: 'manual'
    },
    notes: 'Observed from the browser login flow; manual redirect probe for the sign-in bootstrap path.'
  }
];

export function getWebApiProbe(id: string): WebApiProbe | undefined {
  return PLAYSTATION_WEB_API_PROBES.find((probe) => probe.id === id);
}
