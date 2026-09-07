"use client";

import { useState, type ReactNode } from "react";

/**
 * The LINE group's profile picture, with the caller's icon as the fallback.
 *
 * A plain <img> rather than next/image on purpose: these URLs come straight
 * from line-scdn.net and change whenever the group's picture does, so routing
 * them through the optimizer would mean whitelisting a remote host and putting
 * the server in the path of every avatar for no layout benefit — the box is a
 * fixed size either way. What matters instead is the failure case, and that
 * needs client state: a picture_url that 404s (an expired hash, a group whose
 * picture was removed) has to fall back to the icon rather than leave a broken
 * image in the corner of the card.
 */
export function GroupAvatar({
  src,
  alt,
  className,
  fallback,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Shown when there is no picture, or when the one there is fails to load. */
  fallback: ReactNode;
}) {
  const url = src?.trim() ? src.trim() : null;

  const [broken, setBroken] = useState(false);
  // A group whose picture changed gets a new URL; that one deserves its own
  // attempt rather than inheriting the last one's failure. Adjusted during
  // render, which is the pattern React recommends over an effect.
  const [lastUrl, setLastUrl] = useState(url);
  if (lastUrl !== url) {
    setLastUrl(url);
    setBroken(false);
  }

  if (!url || broken) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={className}
    />
  );
}
