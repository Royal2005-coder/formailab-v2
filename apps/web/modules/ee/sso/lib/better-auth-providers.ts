import "server-only";
import type { BetterAuthOptions } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins";
import {
  AZUREAD_CLIENT_ID,
  AZUREAD_CLIENT_SECRET,
  AZUREAD_TENANT_ID,
  AZURE_OAUTH_ENABLED,
  ENTERPRISE_LICENSE_KEY,
  GITHUB_ID,
  GITHUB_OAUTH_ENABLED,
  GITHUB_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_ENABLED,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ISSUER,
  OIDC_OAUTH_ENABLED,
  SAML_OAUTH_ENABLED,
  SAML_PRODUCT,
  SAML_TENANT,
  WEBAPP_URL,
} from "@/lib/constants";
import { captureSsoIdentity } from "./sso-request-context";

// Better Auth's per-provider profile types, extracted so the social mappers below aren't implicitly
// `any` (their generic-OAuth siblings get this from `satisfies GenericOAuthConfig`).
type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;
// Each provider is `Config | (() => Awaitable<Config>)`; pull the config object out of that union.
type SocialConfig<K extends keyof SocialProviders> = Extract<
  NonNullable<SocialProviders[K]>,
  { mapProfileToUser?: unknown }
>;
type GithubProfile = Parameters<NonNullable<SocialConfig<"github">["mapProfileToUser"]>>[0];
type GoogleProfile = Parameters<NonNullable<SocialConfig<"google">["mapProfileToUser"]>>[0];

export const ssoSocialProviders = ENTERPRISE_LICENSE_KEY
  ? {
      ...(GITHUB_OAUTH_ENABLED
        ? {
            github: {
              clientId: GITHUB_ID ?? "",
              clientSecret: GITHUB_SECRET ?? "",
              // Capture the resolved identity for verify-before-link recovery (design doc §13).
              // ⚠ providerAccountId must equal Better Auth's account.accountId — validate at cutover.
              mapProfileToUser: (profile: GithubProfile) => {
                captureSsoIdentity({ email: profile.email, providerAccountId: String(profile.id) });
                return { email: profile.email };
              },
            },
          }
        : {}),
      ...(GOOGLE_OAUTH_ENABLED
        ? {
            google: {
              clientId: GOOGLE_CLIENT_ID ?? "",
              clientSecret: GOOGLE_CLIENT_SECRET ?? "",
              redirectURI: `${WEBAPP_URL}/api/auth/callback/google`,
              mapProfileToUser: (profile: GoogleProfile) => {
                captureSsoIdentity({ email: profile.email, providerAccountId: profile.sub });
                return { email: profile.email };
              },
            },
          }
        : {}),
    }
  : {};

export const ssoGenericOAuthConfig: GenericOAuthConfig[] = ENTERPRISE_LICENSE_KEY
  ? [
      ...(AZURE_OAUTH_ENABLED
        ? [
            {
              providerId: "azuread",
              clientId: AZUREAD_CLIENT_ID ?? "",
              clientSecret: AZUREAD_CLIENT_SECRET ?? "",
              discoveryUrl: `https://login.microsoftonline.com/${AZUREAD_TENANT_ID || "common"}/v2.0/.well-known/openid-configuration`,
              scopes: ["openid", "email", "profile"],
              pkce: true,
              // Must stay false for Azure. Better Auth's issuer check reads the RFC 9207
              // authorization-RESPONSE `iss` query parameter, and Microsoft Entra does not implement
              // RFC 9207 — its v2.0 metadata omits `authorization_response_iss_parameter_supported`
              // and it never returns that param. So enabling this can only ever fail with
              // `error=issuer_missing` (ENG-1800); it can never pass, regardless of tenant. The
              // param's purpose (disambiguating which AS responded, to defend against mix-up) is
              // already covered here structurally: the per-provider callback path pins the token
              // endpoint to Azure's own, and PKCE (above) + state validation bind the exchange. OIDC
              // (below) keeps the check on because a spec-compliant provider does return `iss`.
              requireIssuerValidation: false,
              mapProfileToUser: (profile) => {
                // Capture for verify-before-link recovery; name parity with the OIDC mapping.
                captureSsoIdentity({ email: profile.email, providerAccountId: profile.sub });
                return {
                  email: profile.email,
                  name:
                    profile.name ||
                    [profile.given_name, profile.family_name].filter(Boolean).join(" ") ||
                    profile.preferred_username,
                };
              },
            } satisfies GenericOAuthConfig,
          ]
        : []),
      ...(OIDC_OAUTH_ENABLED
        ? [
            {
              providerId: "openid",
              clientId: OIDC_CLIENT_ID ?? "",
              clientSecret: OIDC_CLIENT_SECRET ?? "",
              discoveryUrl: `${OIDC_ISSUER}/.well-known/openid-configuration`,
              scopes: ["openid", "email", "profile"],
              pkce: true,
              requireIssuerValidation: true, // RFC 9207 mix-up defense (design doc §10.3)
              mapProfileToUser: (profile) => {
                captureSsoIdentity({ email: profile.email, providerAccountId: profile.sub });
                return {
                  email: profile.email,
                  // Parity with provisionNewSsoUser (OIDC): name → given+family → preferred_username.
                  name:
                    profile.name ||
                    [profile.given_name, profile.family_name].filter(Boolean).join(" ") ||
                    profile.preferred_username,
                };
              },
            } satisfies GenericOAuthConfig,
          ]
        : []),
      ...(SAML_OAUTH_ENABLED
        ? [
            {
              // BoxyHQ SAML bridge — points at the existing local Jackson endpoints (unchanged).
              providerId: "saml",
              clientId: "dummy",
              clientSecret: "dummy",
              authorizationUrl: `${WEBAPP_URL}/api/auth/saml/authorize`,
              tokenUrl: `${WEBAPP_URL}/api/auth/saml/token`,
              userInfoUrl: `${WEBAPP_URL}/api/auth/saml/userinfo`,
              scopes: [],
              pkce: true,
              authorizationUrlParams: { provider: "saml", tenant: SAML_TENANT, product: SAML_PRODUCT },
              mapProfileToUser: (profile) => {
                // ⚠ BoxyHQ's userinfo id — validate it matches Better Auth's account.accountId at cutover.
                captureSsoIdentity({ email: profile.email, providerAccountId: String(profile.id) });
                return {
                  email: profile.email,
                  // Parity with provisionNewSsoUser (SAML): name → firstName + lastName.
                  name: profile.name || [profile.firstName, profile.lastName].filter(Boolean).join(" "),
                };
              },
            } satisfies GenericOAuthConfig,
          ]
        : []),
    ]
  : [];
