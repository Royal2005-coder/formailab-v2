import "server-only";
import type { GenericOAuthConfig } from "better-auth/plugins";
import {
  AI_LAB_KEYCLOAK_CLIENT_ID,
  AI_LAB_KEYCLOAK_CLIENT_SECRET,
  AI_LAB_KEYCLOAK_ENABLED,
  AI_LAB_KEYCLOAK_ISSUER,
} from "@/lib/constants";

export const AI_LAB_KEYCLOAK_PROVIDER_ID = "ai-lab-keycloak";

interface TAiLabKeycloakProviderInput {
  clientId: string;
  clientSecret: string;
  issuer: string;
}

export const buildAiLabKeycloakProvider = ({
  clientId,
  clientSecret,
  issuer,
}: Readonly<TAiLabKeycloakProviderInput>): GenericOAuthConfig => ({
  providerId: AI_LAB_KEYCLOAK_PROVIDER_ID,
  clientId,
  clientSecret,
  discoveryUrl: `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
  scopes: ["openid", "email", "profile"],
  pkce: true,
  requireIssuerValidation: true,
  mapProfileToUser: (profile) => ({
    email: profile.email,
    name:
      profile.name ||
      [profile.given_name, profile.family_name].filter(Boolean).join(" ") ||
      profile.preferred_username,
  }),
});

export const aiLabKeycloakOAuthConfig: GenericOAuthConfig[] = AI_LAB_KEYCLOAK_ENABLED
  ? [
      buildAiLabKeycloakProvider({
        clientId: AI_LAB_KEYCLOAK_CLIENT_ID!,
        clientSecret: AI_LAB_KEYCLOAK_CLIENT_SECRET!,
        issuer: AI_LAB_KEYCLOAK_ISSUER!,
      }),
    ]
  : [];
