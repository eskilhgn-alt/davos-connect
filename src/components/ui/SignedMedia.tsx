/**
 * SignedImg / SignedMedia — resolves a private-bucket path to a signed URL
 * and renders an <img>/<video>. Falls back to legacy URLs when only a URL
 * (no explicit bucket/path) is provided.
 */

import * as React from 'react';
import { resolveMediaUrl, type Bucket } from '@/lib/mediaUrl';

interface Base {
  bucket?: Bucket | null;
  path?: string | null;
  url?: string | null;
  alt?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  loading?: 'lazy' | 'eager';
}

export function useSignedUrl(bucket?: Bucket | null, path?: string | null, url?: string | null): string | undefined {
  const [resolved, setResolved] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    let live = true;
    resolveMediaUrl({ bucket, path, url }).then((u) => {
      if (live) setResolved(u || undefined);
    }).catch(() => { if (live) setResolved(undefined); });
    return () => { live = false; };
  }, [bucket, path, url]);
  return resolved;
}

export const SignedImg: React.FC<Base> = ({ bucket, path, url, alt = '', className, onClick, loading = 'lazy' }) => {
  const resolved = useSignedUrl(bucket, path, url);
  if (!resolved) return <div className={className} data-loading="1" />;
  return <img src={resolved} alt={alt} className={className} onClick={onClick} loading={loading} decoding="async" />;
};

export const SignedVideo: React.FC<Base & { controls?: boolean; muted?: boolean; playsInline?: boolean }> = ({
  bucket, path, url, className, onClick, controls, muted, playsInline,
}) => {
  const resolved = useSignedUrl(bucket, path, url);
  if (!resolved) return <div className={className} data-loading="1" />;
  return (
    <video
      src={resolved}
      className={className}
      onClick={onClick}
      controls={controls}
      muted={muted}
      playsInline={playsInline}
      preload="metadata"
    />
  );
};
