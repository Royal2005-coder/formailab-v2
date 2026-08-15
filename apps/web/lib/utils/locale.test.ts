import * as nextHeaders from "next/headers";
import { describe, expect, test, vi } from "vitest";
import { AVAILABLE_LOCALES, DEFAULT_LOCALE } from "@/lib/constants";
import { appLanguages } from "@/lib/i18n/utils";
import { findMatchingLocale } from "./locale";

// Mock the Next.js headers function
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

describe("locale", () => {
  test("returns DEFAULT_LOCALE when Accept-Language header is missing", async () => {
    // For AI Lab, DEFAULT_LOCALE is always returned for unauthenticated users
    vi.mocked(nextHeaders.headers).mockReturnValue({
      get: vi.fn().mockReturnValue(null),
    } as any);

    const result = await findMatchingLocale();

    expect(result).toBe(DEFAULT_LOCALE);
  });

  test("returns DEFAULT_LOCALE regardless of Accept-Language header", async () => {
    // AI Lab always defaults to the system DEFAULT_LOCALE (vi-VN) for unauthenticated users,
    // ignoring the browser's Accept-Language header.
    vi.mocked(nextHeaders.headers).mockReturnValue({
      get: vi.fn().mockReturnValue("en-US,fr-FR,de-DE"),
    } as any);

    const result = await findMatchingLocale();

    expect(result).toBe(DEFAULT_LOCALE);
  });

  test("returns DEFAULT_LOCALE when no match is found", async () => {
    vi.mocked(nextHeaders.headers).mockReturnValue({
      get: vi.fn().mockReturnValue("xx-XX,yy-YY"),
    } as any);

    const result = await findMatchingLocale();

    expect(result).toBe(DEFAULT_LOCALE);
  });

  test("DEFAULT_LOCALE is vi-VN", async () => {
    expect(DEFAULT_LOCALE).toBe("vi-VN");
  });

  test("vi-VN is in AVAILABLE_LOCALES", async () => {
    expect(AVAILABLE_LOCALES).toContain("vi-VN");
  });

  test("vi-VN is in appLanguages", async () => {
    const vietnameseLanguage = appLanguages.find((lang) => lang.code === "vi-VN");
    expect(vietnameseLanguage).toBeDefined();
    expect(vietnameseLanguage?.label["en-US"]).toBe("Vietnamese");
    expect(vietnameseLanguage?.label.native).toBe("Tiếng Việt");
  });

  test("ko-KR is available with its Korean label", () => {
    expect(AVAILABLE_LOCALES).toContain("ko-KR");

    const koreanLanguage = appLanguages.find((language) => language.code === "ko-KR");
    expect(koreanLanguage?.label["en-US"]).toBe("Korean");
    expect(koreanLanguage?.label.native).toBe("한국어");
  });
});
