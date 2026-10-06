/**
 * Trademark bootstrap DATA — a curated set of well-known REGISTERED marks
 * (public record) across NICE classes. Pure data (no @aegis/db) so both the
 * runtime bootstrap writer AND the dev seed can read it without a package
 * cycle. Same shape as the sanctions bootstrap.
 *
 * Production upgrade: swap this for a USPTO open-trademark-API loader (per
 * class, LIVE marks). Until then the knock-out screen runs against these.
 */
export interface BootstrapMark {
  ref: string;
  wordMark: string;
  classes: number[];
  owner: string;
  status?: string;
}

export const TRADEMARK_BOOTSTRAP: BootstrapMark[] = [
  { ref: "TM-APPLE", wordMark: "APPLE", classes: [9, 42], owner: "Apple Inc." },
  { ref: "TM-GOOGLE", wordMark: "GOOGLE", classes: [9, 38, 42], owner: "Google LLC" },
  { ref: "TM-AMAZON", wordMark: "AMAZON", classes: [9, 35, 42], owner: "Amazon Technologies, Inc." },
  { ref: "TM-MICROSOFT", wordMark: "MICROSOFT", classes: [9, 42], owner: "Microsoft Corporation" },
  { ref: "TM-SNOWFLAKE", wordMark: "SNOWFLAKE", classes: [9, 42], owner: "Snowflake Inc." },
  { ref: "TM-ORACLE", wordMark: "ORACLE", classes: [9, 42], owner: "Oracle International Corporation" },
  { ref: "TM-SALESFORCE", wordMark: "SALESFORCE", classes: [9, 42], owner: "Salesforce, Inc." },
  { ref: "TM-META", wordMark: "META", classes: [9, 38, 42], owner: "Meta Platforms, Inc." },
  { ref: "TM-AZURE", wordMark: "AZURE", classes: [9, 42], owner: "Microsoft Corporation" },
  { ref: "TM-NIKE", wordMark: "NIKE", classes: [25, 28], owner: "Nike, Inc." },
  { ref: "TM-ADIDAS", wordMark: "ADIDAS", classes: [25, 28], owner: "adidas AG" },
  { ref: "TM-COCACOLA", wordMark: "COCA-COLA", classes: [32], owner: "The Coca-Cola Company" },
  { ref: "TM-PEPSI", wordMark: "PEPSI", classes: [32], owner: "PepsiCo, Inc." },
  { ref: "TM-STARBUCKS", wordMark: "STARBUCKS", classes: [30, 43], owner: "Starbucks Corporation" },
  { ref: "TM-MCDONALDS", wordMark: "MCDONALD'S", classes: [43], owner: "McDonald's Corporation" },
  { ref: "TM-TESLA", wordMark: "TESLA", classes: [12], owner: "Tesla, Inc." },
  { ref: "TM-TOYOTA", wordMark: "TOYOTA", classes: [12], owner: "Toyota Jidosha K.K." },
  { ref: "TM-DISNEY", wordMark: "DISNEY", classes: [41], owner: "Disney Enterprises, Inc." },
  { ref: "TM-NETFLIX", wordMark: "NETFLIX", classes: [38, 41], owner: "Netflix, Inc." },
  { ref: "TM-SPOTIFY", wordMark: "SPOTIFY", classes: [9, 38, 41], owner: "Spotify AB" },
  { ref: "TM-UBER", wordMark: "UBER", classes: [9, 39], owner: "Uber Technologies, Inc." },
  { ref: "TM-AIRBNB", wordMark: "AIRBNB", classes: [39, 43], owner: "Airbnb, Inc." },
  { ref: "TM-PAYPAL", wordMark: "PAYPAL", classes: [36], owner: "PayPal, Inc." },
  { ref: "TM-VISA", wordMark: "VISA", classes: [36], owner: "Visa International" },
  { ref: "TM-STRIPE", wordMark: "STRIPE", classes: [9, 36], owner: "Stripe, Inc." },
  { ref: "TM-SLACK", wordMark: "SLACK", classes: [9, 42], owner: "Slack Technologies, LLC" },
  { ref: "TM-ZOOM", wordMark: "ZOOM", classes: [9, 38, 42], owner: "Zoom Video Communications, Inc." },
  { ref: "TM-INTEL", wordMark: "INTEL", classes: [9], owner: "Intel Corporation" },
  { ref: "TM-SAMSUNG", wordMark: "SAMSUNG", classes: [9], owner: "Samsung Electronics Co., Ltd." },
  { ref: "TM-IBM", wordMark: "IBM", classes: [9, 42], owner: "International Business Machines Corporation" },
];
