import { describe, expect, test } from "vitest";
import { renderInviteEmail } from "@formbricks/email";

const t = (key: string, replacements?: Record<string, string>): string => {
  const translations: Record<string, string> = {
    "emails.email_footer_text_1": "Chúc một ngày tốt lành!",
    "emails.email_footer_text_2": "Đội ngũ AILAB Survey",
    "emails.email_template_text_1": "Email này được gửi qua AILAB Survey.",
    "emails.invite_email_button_label": "Tham gia tổ chức",
    "emails.invite_email_heading": `Chào ${replacements?.inviteeName}`,
    "emails.invite_email_text": `Đồng nghiệp ${replacements?.inviterName} của bạn đã mời bạn tham gia AILAB Survey.`,
  };

  return translations[key] ?? key;
};

describe("renderInviteEmail", () => {
  test("renders the AILAB Survey brand, logo and Vietnamese invitation", async () => {
    const html = await renderInviteEmail({
      inviteeName: "Khách hàng",
      inviterName: "AI Lab",
      logoLink: "https://formailab.royalai.dev",
      logoUrl: "https://formailab.royalai.dev/images/ai-lab-email-logo.png",
      verifyLink: "https://formailab.royalai.dev/invite?token=test-token",
      t,
    });

    expect(html).toContain("Chào Khách hàng");
    expect(html).toContain("Tham gia tổ chức");
    expect(html).toContain("AILAB Survey");
    expect(html).toContain("https://formailab.royalai.dev/images/ai-lab-email-logo.png");
    expect(html).not.toContain("app.formbricks.com/logo-transparent.png");
    expect(html).not.toContain("formbricks.com/?utm_source=email_header");
  });
});
