import type {
  PrototypeCapabilityState,
  PlayStationPlusPrototypeStatus
} from '../providers/playstation-plus-observation-provider.js';
import type { SessionSurface } from '../architecture/provider-types.js';

export type PlayStationPlusFlowPhase =
  | 'signed-out'
  | 'browser-login-opened'
  | 'browser-login-confirmed'
  | 'signed-in-observed'
  | 'entitlements-gated'
  | 'allocation-placeholder';

export type PlayStationPlusFlowLoginMode = 'system-browser' | 'capture-artifacts';

export type PlayStationPlusFlowHistoryEntry = {
  at: string;
  event: 'open-browser-login' | 'confirm-browser-login' | 'sync-provider-status' | 'reset';
  phase: PlayStationPlusFlowPhase;
  summary: string;
};

export type PlayStationPlusFlowObservation = {
  generatedAt: string;
  signedIn: boolean;
  surface: SessionSurface;
  loginState: PrototypeCapabilityState;
  entitlementsState: PrototypeCapabilityState;
  sessionAllocationState: PrototypeCapabilityState;
};

export type PlayStationPlusFlowState = {
  generatedAt: string;
  phase: PlayStationPlusFlowPhase;
  browserLogin: {
    mode?: PlayStationPlusFlowLoginMode;
    loginUrl?: string;
    openedAt?: string;
    waitSeconds?: number | null;
    confirmedAt?: string;
    confirmationNote?: string;
  };
  lastObservation: PlayStationPlusFlowObservation | null;
  history: PlayStationPlusFlowHistoryEntry[];
  nextActions: string[];
};

export type PlayStationPlusFlowEvent =
  | {
      type: 'open-browser-login';
      at?: string;
      mode: PlayStationPlusFlowLoginMode;
      loginUrl: string;
      waitSeconds?: number | null;
    }
  | {
      type: 'confirm-browser-login';
      at?: string;
      note?: string;
    }
  | {
      type: 'sync-provider-status';
      at?: string;
      status: PlayStationPlusPrototypeStatus;
    }
  | {
      type: 'reset';
      at?: string;
    };

const PHASE_RANK: Record<PlayStationPlusFlowPhase, number> = {
  'signed-out': 0,
  'browser-login-opened': 1,
  'browser-login-confirmed': 2,
  'signed-in-observed': 3,
  'entitlements-gated': 4,
  'allocation-placeholder': 5
};

function trimHistory(entries: PlayStationPlusFlowHistoryEntry[]) {
  return entries.slice(-40);
}

function maxPhase(...phases: PlayStationPlusFlowPhase[]) {
  return phases.reduce((highest, next) => (PHASE_RANK[next] > PHASE_RANK[highest] ? next : highest), 'signed-out');
}

function summarizeObservation(status: PlayStationPlusPrototypeStatus): PlayStationPlusFlowObservation {
  return {
    generatedAt: status.generatedAt,
    signedIn: status.session.signedIn,
    surface: status.session.surface,
    loginState: status.capabilities.login.state,
    entitlementsState: status.capabilities.entitlements.state,
    sessionAllocationState: status.capabilities.sessionAllocation.state
  };
}

function observationEquals(
  left: PlayStationPlusFlowObservation | null,
  right: PlayStationPlusFlowObservation | null
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    left.generatedAt === right.generatedAt &&
    left.signedIn === right.signedIn &&
    left.surface === right.surface &&
    left.loginState === right.loginState &&
    left.entitlementsState === right.entitlementsState &&
    left.sessionAllocationState === right.sessionAllocationState
  );
}

export function deriveFlowPhaseFromPrototypeStatus(status: PlayStationPlusPrototypeStatus): PlayStationPlusFlowPhase {
  if (status.capabilities.sessionAllocation.state === 'placeholder') {
    return 'allocation-placeholder';
  }

  if (status.capabilities.entitlements.state === 'gated') {
    return 'entitlements-gated';
  }

  if (status.capabilities.login.state === 'observed' || status.session.signedIn) {
    return 'signed-in-observed';
  }

  return 'signed-out';
}

function summarizeOpenBrowserEvent(event: Extract<PlayStationPlusFlowEvent, { type: 'open-browser-login' }>) {
  return `${event.mode} -> ${event.loginUrl}`;
}

function summarizeConfirmBrowserEvent(event: Extract<PlayStationPlusFlowEvent, { type: 'confirm-browser-login' }>) {
  return event.note ? `confirmed (${event.note})` : 'confirmed by user';
}

function summarizeSyncEvent(observation: PlayStationPlusFlowObservation) {
  return `signedIn=${observation.signedIn} login=${observation.loginState} entitlements=${observation.entitlementsState} allocation=${observation.sessionAllocationState}`;
}

function summarizeResetEvent() {
  return 'reset to signed-out';
}

function deriveNextActions(state: PlayStationPlusFlowState): string[] {
  switch (state.phase) {
    case 'signed-out':
      return [
        'Open the official browser login with `npm run prototype:psplus -- login --wait-seconds 600`.',
        'If local auth artifacts are needed, use `npm run prototype:psplus -- login --capture-artifacts --wait-seconds 600`.'
      ];
    case 'browser-login-opened':
      return [
        'Complete sign-in in the browser window.',
        'Then run `npm run prototype:psplus -- confirm-login --note "browser session ready"`.'
      ];
    case 'browser-login-confirmed':
      return [
        'Run `npm run prototype:psplus -- status` to inspect synchronized provider state.',
        'If sign-in was browser-only and you need local auth artifacts, run the capture-artifacts mode next.'
      ];
    case 'signed-in-observed':
      return [
        'Inspect bootstrap details with `npm run prototype:psplus -- bootstrap`.',
        'Review gated entitlement placeholders with `npm run prototype:psplus -- entitlements`.'
      ];
    case 'entitlements-gated':
      return [
        'Inspect placeholder entitlement records with `npm run prototype:psplus -- entitlements`.',
        'Advance the client UX using placeholder allocation seams rather than pretending the entitlement gate is solved.'
      ];
    case 'allocation-placeholder':
      return [
        'Use `npm run prototype:psplus -- allocate --title-id <TITLE>` to drive placeholder launch/control-flow seams.',
        'Replace placeholder allocation only after a real entitled queue/start capture exists.'
      ];
  }
}

export function createInitialPlayStationPlusFlowState(at = new Date().toISOString()): PlayStationPlusFlowState {
  const state: PlayStationPlusFlowState = {
    generatedAt: at,
    phase: 'signed-out',
    browserLogin: {},
    lastObservation: null,
    history: [],
    nextActions: []
  };
  return {
    ...state,
    nextActions: deriveNextActions(state)
  };
}

function withHistory(
  state: PlayStationPlusFlowState,
  entry: PlayStationPlusFlowHistoryEntry | null
): PlayStationPlusFlowState {
  const history = entry ? trimHistory([...state.history, entry]) : state.history;
  return {
    ...state,
    history,
    nextActions: deriveNextActions({ ...state, history })
  };
}

export function transitionPlayStationPlusFlowState(
  currentState: PlayStationPlusFlowState,
  event: PlayStationPlusFlowEvent
): PlayStationPlusFlowState {
  const at = event.at ?? new Date().toISOString();

  if (event.type === 'reset') {
    const resetState = createInitialPlayStationPlusFlowState(at);
    return withHistory(resetState, {
      at,
      event: 'reset',
      phase: resetState.phase,
      summary: summarizeResetEvent()
    });
  }

  if (event.type === 'open-browser-login') {
    const nextState: PlayStationPlusFlowState = {
      ...currentState,
      generatedAt: at,
      phase: 'browser-login-opened',
      browserLogin: {
        ...currentState.browserLogin,
        mode: event.mode,
        loginUrl: event.loginUrl,
        openedAt: at,
        waitSeconds: event.waitSeconds ?? null
      }
    };

    return withHistory(nextState, {
      at,
      event: 'open-browser-login',
      phase: nextState.phase,
      summary: summarizeOpenBrowserEvent(event)
    });
  }

  if (event.type === 'confirm-browser-login') {
    const nextState: PlayStationPlusFlowState = {
      ...currentState,
      generatedAt: at,
      phase: maxPhase(currentState.phase, 'browser-login-confirmed'),
      browserLogin: {
        ...currentState.browserLogin,
        confirmedAt: at,
        confirmationNote: event.note
      }
    };

    return withHistory(nextState, {
      at,
      event: 'confirm-browser-login',
      phase: nextState.phase,
      summary: summarizeConfirmBrowserEvent(event)
    });
  }

  const observation = summarizeObservation(event.status);
  const derivedPhase = deriveFlowPhaseFromPrototypeStatus(event.status);
  const nextState: PlayStationPlusFlowState = {
    ...currentState,
    generatedAt: at,
    phase: maxPhase(currentState.phase, derivedPhase),
    lastObservation: observation
  };

  const summary = summarizeSyncEvent(observation);
  const shouldAppendHistory =
    nextState.phase !== currentState.phase || !observationEquals(currentState.lastObservation, observation);

  return withHistory(
    nextState,
    shouldAppendHistory
      ? {
          at,
          event: 'sync-provider-status',
          phase: nextState.phase,
          summary
        }
      : null
  );
}
