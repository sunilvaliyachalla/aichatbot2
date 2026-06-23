import "dotenv/config";

/** Environment-based configuration for the signaling server. */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Allowed CORS origins. "*" allows all (development only). */
  corsOrigin: parseOrigins(process.env.CORS_ORIGIN ?? "*"),
  /** Maximum peers per room. Default 2 for 1:1 calls. */
  maxPeersPerRoom: Number(process.env.MAX_PEERS_PER_ROOM ?? 2),
} as const;

function parseOrigins(value: string): string | string[] {
  const trimmed = value.trim();
  if (trimmed === "*" || trimmed === "") return "*";
  return trimmed.split(",").map((o) => o.trim()).filter(Boolean);
}
