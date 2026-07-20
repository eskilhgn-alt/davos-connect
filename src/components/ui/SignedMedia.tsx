/**
 * SignedImg / SignedVideo — resolve private-bucket paths to signed URLs and
 * render <img>/<video> with accessible loading, error and retry states.
 *
 * Hook contract:
 * - useSignedMedia(bucket, path, url) returns { url, status, error, retry }.
 *   - status: 'idle' | 'loading' | 'ready' | 'error'
 *   - Auto-refreshes the signed URL just before it expires; timers are cleaned
 *     up on unmount and on any input change.
 *   - retry() invalidates the cache entry and re-signs once. Also called by
 *     the media <img>/<video> on load error before surfacing the error UI.
 * - useSignedUrl(bucket, path, url) is retained as a compat shim returning
 *   string | undefined so existing callers keep compiling.
 *
 * External Giphy/blob URLs pass through unchanged. Empty inputs render an
 * accessible skeleton placeholder (never an empty invisible div).
 */

import * as React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import {
  resolveMediaUrl,
  invalidateMediaUrl,
  isKnownBucket,
  __TEST__,
  type Bucket,
} from '@/lib/mediaUrl';
import { cn } from '@/lib/utils';

export type SignedStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SignedMediaState {
  url: string | undefined;
  status: SignedStatus;
  error: string | null;
  retry: () => void;
}

// Refresh a bit earlier than the cache's own threshold so mounted media
// swaps its src before the URL is expired at the CDN.
const REFRESH_LEAD_MS = 30_000;

/**
 * Stateful signed-URL hook. Auto-refreshes shortly before expiry and cleans
 * up its timer on unmount or when (bucket, path, url) changes.
 */
export function useSignedMedia(
  bucket?: Bucket | null | string,
  path?: string | null,
  url?: string | null,
): SignedMediaState {
  const [state, setState] = React.useState<{ url: string | undefined; status: SignedStatus; error: string | null }>(
    { url: undefined, status: 'idle', error: null },
  );
  // Bump this counter to force a re-resolve (retry).
  const [nonce, setNonce] = React.useState(0);

  const hasAny = Boolean((bucket && path) || url);

  React.useEffect(() => {
    if (!hasAny) {
      setState({ url: undefined, status: 'idle', error: null });
      return;
    }
    let live = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ ...s, status: 'loading', error: null }));

    const startedAt = Date.now();
    const ttlSec = __TEST__.DEFAULT_TTL_SEC;
    resolveMediaUrl({ bucket: bucket ?? null, path: path ?? null, url: url ?? null })
      .then((u) => {
        if (!live) return;
        const resolved = u || undefined;
        setState({ url: resolved, status: resolved ? 'ready' : 'idle', error: null });

        // Schedule refresh only for signed URLs on known private buckets
        // where we control the path. External passthroughs never refresh.
        if (resolved && bucket && path && isKnownBucket(bucket)) {
          const dueMs = Math.max(
            5_000,
            ttlSec * 1000 * 0.9 - (Date.now() - startedAt) - REFRESH_LEAD_MS,
          );
          refreshTimer = setTimeout(() => {
            if (!live) return;
            invalidateMediaUrl(bucket, path);
            setNonce((n) => n + 1);
          }, dueMs);
        }
      })
      .catch((e) => {
        if (!live) return;
        setState({ url: undefined, status: 'error', error: (e as Error)?.message || 'sign failed' });
      });

    return () => {
      live = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
    // nonce triggers explicit re-resolves without changing external identity.
  }, [bucket, path, url, hasAny, nonce]);

  const retry = React.useCallback(() => {
    if (bucket && path && isKnownBucket(bucket)) invalidateMediaUrl(bucket, path);
    setNonce((n) => n + 1);
  }, [bucket, path]);

  return { url: state.url, status: state.status, error: state.error, retry };
}

/** Compat shim: preserves the old string|undefined signature for existing callers. */
export function useSignedUrl(
  bucket?: Bucket | null | string,
  path?: string | null,
  url?: string | null,
): string | undefined {
  return useSignedMedia(bucket, path, url).url;
}

// ---------- Accessible primitives ----------

const SkeletonBox: React.FC<{ className?: string; label?: string }> = ({ className, label }) => (
  <div
    className={cn('bg-muted animate-pulse', className)}
    role="img"
    aria-label={label || 'Laster media'}
    aria-busy="true"
  />
);

const ErrorBox: React.FC<{ className?: string; onRetry: () => void; message?: string | null }>
  = ({ className, onRetry, message }) => (
  <div
    className={cn('flex flex-col items-center justify-center gap-2 p-3 bg-muted/50 border border-border rounded-md text-center', className)}
    role="alert"
    aria-live="polite"
  >
    <div className="flex items-center gap-1 text-destructive text-xs">
      <AlertCircle size={14} aria-hidden="true" />
      <span>Kunne ikke laste media</span>
    </div>
    {message && <span className="text-[11px] text-muted-foreground">{message}</span>}
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
    >
      <RotateCw size={12} aria-hidden="true" />
      <span>Prøv igjen</span>
    </button>
  </div>
);

interface Base {
  bucket?: Bucket | null | string;
  path?: string | null;
  url?: string | null;
  alt?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  loading?: 'lazy' | 'eager';
}

export const SignedImg: React.FC<Base> = ({ bucket, path, url, alt = '', className, onClick, loading = 'lazy' }) => {
  const { url: resolved, status, error, retry } = useSignedMedia(bucket, path, url);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const retryOnceRef = React.useRef(false);
  // Reset the one-shot retry gate only when the caller's identity changes,
  // NOT when an internal re-sign produces a fresh URL for the same path.
  React.useEffect(() => { setLoadFailed(false); retryOnceRef.current = false; }, [bucket, path, url]);

  if (status === 'error' || loadFailed) {
    return <ErrorBox className={className} onRetry={() => { setLoadFailed(false); retry(); }} message={error} />;
  }
  if (!resolved) return <SkeletonBox className={className} label={alt || 'Laster bilde'} />;
  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      onClick={onClick}
      loading={loading}
      decoding="async"
      onError={() => {
        if (!retryOnceRef.current) {
          retryOnceRef.current = true;
          retry();
        } else {
          setLoadFailed(true);
        }
      }}
    />
  );
};

export const SignedVideo: React.FC<Base & { controls?: boolean; muted?: boolean; playsInline?: boolean }> = ({
  bucket, path, url, className, onClick, controls, muted, playsInline,
}) => {
  const { url: resolved, status, error, retry } = useSignedMedia(bucket, path, url);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const retryOnceRef = React.useRef(false);
  React.useEffect(() => { setLoadFailed(false); retryOnceRef.current = false; }, [resolved]);

  if (status === 'error' || loadFailed) {
    return <ErrorBox className={className} onRetry={() => { setLoadFailed(false); retry(); }} message={error} />;
  }
  if (!resolved) return <SkeletonBox className={className} label="Laster video" />;
  return (
    <video
      src={resolved}
      className={className}
      onClick={onClick}
      controls={controls}
      muted={muted}
      playsInline={playsInline}
      preload="metadata"
      onError={() => {
        if (!retryOnceRef.current) {
          retryOnceRef.current = true;
          retry();
        } else {
          setLoadFailed(true);
        }
      }}
    />
  );
};

/**
 * Reusable download/link state for non-media attachments. Renders a
 * skeleton while resolving, an error+retry UI on failure, and an anchor
 * once the URL is ready.
 */
export const SignedDownloadLink: React.FC<{
  bucket?: Bucket | null | string;
  path?: string | null;
  url?: string | null;
  filename?: string;
  className?: string;
  children?: React.ReactNode;
  loadingLabel?: string;
}> = ({ bucket, path, url, filename, className, children, loadingLabel }) => {
  const { url: resolved, status, error, retry } = useSignedMedia(bucket, path, url);
  if (status === 'error') {
    return <ErrorBox className={className} onRetry={retry} message={error} />;
  }
  const disabled = !resolved;
  return (
    <a
      href={resolved || undefined}
      target={disabled ? undefined : '_blank'}
      rel="noopener noreferrer"
      download={filename || ''}
      aria-disabled={disabled || undefined}
      aria-label={disabled ? (loadingLabel || `Laster ${filename || 'fil'}…`) : `Last ned ${filename || 'fil'}`}
      onClick={(e) => { if (disabled) e.preventDefault(); }}
      className={cn(className, disabled && 'opacity-70 cursor-progress')}
      aria-busy={disabled || undefined}
    >
      {children}
    </a>
  );
};
