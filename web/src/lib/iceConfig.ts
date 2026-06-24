/**
 * Pure helpers for building the WebRTC ICE server list from environment-style
 * inputs. Kept free of `import.meta`/DOM globals so it is trivially unit-testable.
 */

export interface IceConfigInput {
  stunUrls?: string;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}

const DEFAULT_STUN = "stun:stun.l.google.com:19302";

/**
 * Builds ICE servers. STUN urls are comma-separated. TURN is only included when
 * url, username and credential are all present (TURN is optional by design).
 */
export function buildIceServers(input: IceConfigInput): RTCIceServer[] {
  const servers: RTCIceServer[] = [];

  const stunUrls = (input.stunUrls ?? DEFAULT_STUN)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (stunUrls.length > 0) servers.push({ urls: stunUrls });

  const turnUrl = input.turnUrl?.trim();
  const turnUsername = input.turnUsername?.trim();
  const turnCredential = input.turnCredential?.trim();
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
}
