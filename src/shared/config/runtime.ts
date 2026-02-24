export type RuntimeAuthMode = 'supabase' | 'demo' | 'misconfigured';

export interface RuntimeEnv {
  DEV?: boolean;
  MODE?: string;
  VITE_DEMO_MODE?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_AUTH_DEBUG?: string;
  VITE_APP_INSTANCE_ID?: string;
  VITE_CANONICAL_DEV_ORIGIN?: string;
}

export interface RuntimeConfig {
  runtimeAuthMode: RuntimeAuthMode;
  appInstanceId: string;
  canonicalDevOrigin: string;
  authDebugEnabled: boolean;
}

export interface FlowlyRuntimeSnapshot {
  mode: string;
  runtimeAuthMode: RuntimeAuthMode;
  appInstanceId: string;
  canonicalDevOrigin: string;
  currentOrigin: string;
  authDebugEnabled: boolean;
}

interface LocationLike {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  href: string;
}

const DEFAULT_APP_INSTANCE_ID = 'flowly-main';
const DEFAULT_CANONICAL_DEV_ORIGIN = 'http://localhost:3000';

function hasNonEmptyValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toBooleanFlag(value: unknown) {
  return typeof value === 'string' && value.toLowerCase() === 'true';
}

function normalizeOrigin(value: string | undefined, fallback: string) {
  if (!hasNonEmptyValue(value)) {
    return fallback;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return fallback;
  }
}

function resolveEffectivePort(protocol: string, explicitPort: string) {
  if (explicitPort) {
    return explicitPort;
  }
  return protocol === 'https:' ? '443' : '80';
}

export function resolveRuntimeAuthMode(env: RuntimeEnv): RuntimeAuthMode {
  if ((env.VITE_DEMO_MODE ?? '').toLowerCase() === 'true') {
    return 'demo';
  }

  if (hasNonEmptyValue(env.VITE_SUPABASE_URL) && hasNonEmptyValue(env.VITE_SUPABASE_ANON_KEY)) {
    return 'supabase';
  }

  return 'misconfigured';
}

export function resolveRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
  return {
    runtimeAuthMode: resolveRuntimeAuthMode(env),
    appInstanceId: hasNonEmptyValue(env.VITE_APP_INSTANCE_ID) ? env.VITE_APP_INSTANCE_ID.trim() : DEFAULT_APP_INSTANCE_ID,
    canonicalDevOrigin: normalizeOrigin(env.VITE_CANONICAL_DEV_ORIGIN, DEFAULT_CANONICAL_DEV_ORIGIN),
    authDebugEnabled: toBooleanFlag(env.VITE_AUTH_DEBUG),
  };
}

const env = ((import.meta as any).env || {}) as RuntimeEnv;
export const runtimeConfig = resolveRuntimeConfig(env);

export function buildRuntimeSnapshot(currentOrigin: string, config: RuntimeConfig = runtimeConfig): FlowlyRuntimeSnapshot {
  return {
    mode: (env.MODE ?? '').toString(),
    runtimeAuthMode: config.runtimeAuthMode,
    appInstanceId: config.appInstanceId,
    canonicalDevOrigin: config.canonicalDevOrigin,
    currentOrigin,
    authDebugEnabled: config.authDebugEnabled,
  };
}

export function getCanonicalDevRedirectTarget(
  location: LocationLike,
  config: RuntimeConfig = runtimeConfig,
): string | null {
  if (location.hostname !== '127.0.0.1') {
    return null;
  }

  let canonical: URL;
  try {
    canonical = new URL(config.canonicalDevOrigin);
  } catch {
    return null;
  }

  if (canonical.hostname !== 'localhost') {
    return null;
  }

  const currentPort = resolveEffectivePort(location.protocol, location.port);
  const canonicalPort = resolveEffectivePort(canonical.protocol, canonical.port);
  if (currentPort !== canonicalPort) {
    return null;
  }

  const redirectTarget = `${canonical.protocol}//${canonical.host}${location.pathname}${location.search}${location.hash}`;
  if (redirectTarget === location.href) {
    return null;
  }

  return redirectTarget;
}
