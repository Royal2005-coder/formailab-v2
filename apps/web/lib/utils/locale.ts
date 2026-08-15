import { TUserLocale } from "@formbricks/types/user";
import { DEFAULT_LOCALE } from "@/lib/constants";

export const findMatchingLocale = (): Promise<TUserLocale> => {
  // AILAB Survey intentionally uses one system-wide default for signed-out users.
  // Signed-in users continue to use the locale stored on their user record.
  return Promise.resolve(DEFAULT_LOCALE);
};
