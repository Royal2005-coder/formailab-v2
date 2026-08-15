"use client";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FORMBRICKS_LOGGED_IN_WITH_LS } from "@/lib/localStorage";
import { authClient } from "@/modules/auth/lib/auth-client";
import { Button } from "@/modules/ui/components/button";

const AI_LAB_KEYCLOAK_PROVIDER_ID = "ai-lab-keycloak";

interface KeycloakButtonProps {
  displayName: string;
  returnToUrl: string;
}

export const KeycloakButton = ({ displayName, returnToUrl }: Readonly<KeycloakButtonProps>) => {
  const { t } = useTranslation();
  const handleLogin = useCallback(async () => {
    localStorage.setItem(FORMBRICKS_LOGGED_IN_WITH_LS, "AI LAB Keycloak");
    await authClient.signIn.oauth2({
      providerId: AI_LAB_KEYCLOAK_PROVIDER_ID,
      callbackURL: returnToUrl,
      errorCallbackURL: "/auth/login",
    });
  }, [returnToUrl]);

  return (
    <Button
      type="button"
      onClick={handleLogin}
      variant="secondary"
      className="w-full items-center justify-center gap-2 px-2">
      <span className="truncate">{t("auth.continue_with_oidc", { oidcDisplayName: displayName })}</span>
    </Button>
  );
};
