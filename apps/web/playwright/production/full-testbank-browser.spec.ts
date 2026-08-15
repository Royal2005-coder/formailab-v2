import { registerFullTestbankBrowserTests } from "./full-testbank-browser";

if (
  process.env.PLAYWRIGHT_PRODUCTION_SYSTEM_CASES !== "1" ||
  process.env.PLAYWRIGHT_PRODUCTION_FULL_ROUTES === "1"
) {
  registerFullTestbankBrowserTests();
}
