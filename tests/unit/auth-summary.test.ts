import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAuthArtifacts, type ManualDump, type StorageStateFile } from '../../scripts/lib/auth-summary.js';

function makeCookie(name: string, domain: string) {
  return { name, domain, path: '/', secure: true, httpOnly: true };
}

test('auth summary treats my.account sign-in URL as not signed in', () => {
  const storageState: StorageStateFile = {
    cookies: [makeCookie('KP_uIDz', 'my.account.sony.com'), makeCookie('bm_lso', '.my.account.sony.com')]
  };

  const dump: ManualDump = {
    generatedAt: '2026-03-29T00:00:00.000Z',
    detectedSignInCompletion: true,
    currentUrl:
      'https://my.account.sony.com/sonyacct/signin/?response_type=code&error=login_required#/signin/input/id',
    pages: [{ url: 'https://my.account.sony.com/sonyacct/signin/?x=1', title: 'Sign In | PlayStation' }],
    sonyCookieCount: 2,
    signInPromptVisible: false,
    authLikeCookieNames: ['my.account.sony.com:KP_uIDz'],
    originStorage: {
      'https://my.account.sony.com': {
        localStorage: { ak_a: 'x' },
        sessionStorage: { TAB_ID: 'y' }
      }
    }
  };

  const summary = summarizeAuthArtifacts(storageState, dump);
  assert.equal(summary.onSigninSurface, true);
  assert.equal(summary.likelySignedIn, false);
  assert.equal(summary.currentUrl, 'https://my.account.sony.com/sonyacct/signin/');
});

test('auth summary treats post-login page with auth cookies as likely signed in', () => {
  const storageState: StorageStateFile = {
    cookies: [
      makeCookie('KP_uIDz', 'my.account.sony.com'),
      makeCookie('session', '.playstation.com'),
      makeCookie('userinfo', '.playstation.com')
    ]
  };

  const dump: ManualDump = {
    generatedAt: '2026-03-29T00:00:00.000Z',
    detectedSignInCompletion: true,
    currentUrl: 'https://store.playstation.com/en-us/pages/latest',
    pages: [{ url: 'https://store.playstation.com/en-us/pages/latest', title: 'Latest | Official PlayStation™Store US' }],
    sonyCookieCount: 3,
    signInPromptVisible: false,
    authLikeCookieNames: ['my.account.sony.com:KP_uIDz'],
    originStorage: {
      'https://store.playstation.com': {
        localStorage: { '!gct!identifier-short-term-id-store': 'x' },
        sessionStorage: { isSignedIn: 'true' }
      }
    }
  };

  const summary = summarizeAuthArtifacts(storageState, dump);
  assert.equal(summary.onSigninSurface, false);
  assert.equal(summary.likelySignedIn, true);
  assert.equal(summary.currentUrl, 'https://store.playstation.com/en-us/pages/latest');
});
