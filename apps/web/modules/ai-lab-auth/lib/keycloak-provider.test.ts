import { describe, expect, test } from "vitest";
import { AI_LAB_KEYCLOAK_PROVIDER_ID, buildAiLabKeycloakProvider } from "./keycloak-provider";

describe("buildAiLabKeycloakProvider", () => {
  test("builds an issuer-validated PKCE provider with a stable independent id", () => {
    const provider = buildAiLabKeycloakProvider({
      clientId: "client",
      clientSecret: "secret",
      issuer: "https://identity.example.test/realms/ai-lab/",
    });

    expect(provider).toMatchObject({
      providerId: AI_LAB_KEYCLOAK_PROVIDER_ID,
      discoveryUrl: "https://identity.example.test/realms/ai-lab/.well-known/openid-configuration",
      scopes: ["openid", "email", "profile"],
      pkce: true,
      requireIssuerValidation: true,
    });
  });

  test("maps standard Keycloak profile fields without assigning application roles", () => {
    const provider = buildAiLabKeycloakProvider({
      clientId: "client",
      clientSecret: "secret",
      issuer: "https://identity.example.test/realms/ai-lab",
    });

    expect(
      provider.mapProfileToUser?.({
        sub: "keycloak-subject",
        email: "researcher@example.test",
        given_name: "AI",
        family_name: "Researcher",
      })
    ).toEqual({ email: "researcher@example.test", name: "AI Researcher" });
  });
});
