import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

/** Builds the resolver on first use and reuses it, so jose's key cache survives across requests. */
export function lazyJwks(create: () => JWTVerifyGetKey): JWTVerifyGetKey {
  let resolver: JWTVerifyGetKey | undefined;
  return (header, token) => {
    resolver ??= create();
    return resolver(header, token);
  };
}

export function remoteSupabaseJwks(supabaseUrl: string): JWTVerifyGetKey {
  return lazyJwks(() =>
    createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)),
  );
}
