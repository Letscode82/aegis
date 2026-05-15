/**
 * Display-name priority — guards against a regression where the
 * Auth0 session's `user.name` claim (which some connection types
 * default to the email address) overrides the DB-stored display
 * name set by the seed.
 *
 * Symptom if this regresses: the Cockpit attorney label, AI Ops
 * Live Agent Activity feed, Capacity panel "Suggested assignee",
 * and every audit `actorId → User.name` join all render as the
 * email instead of the real name.
 */
import { describe, expect, it } from "vitest";
import { resolveDisplayName } from "../src/server";

describe("resolveDisplayName()", () => {
  const EMAIL = "harsha.19xx@gmail.com";

  it.each([
    [
      "DB name wins over Auth0 nameHint (the bug case)",
      { dbName: "Harsha_G", nameHint: EMAIL, email: EMAIL },
      "Harsha_G",
    ],
    [
      "DB name wins even when nameHint is a 'real' name",
      { dbName: "Harsha_G", nameHint: "Some Other Name", email: EMAIL },
      "Harsha_G",
    ],
    [
      "Falls through to nameHint when DB name is null",
      { dbName: null, nameHint: "Auth0 Name", email: EMAIL },
      "Auth0 Name",
    ],
    [
      "Falls through to nameHint when DB name is undefined",
      { dbName: undefined, nameHint: "Auth0 Name", email: EMAIL },
      "Auth0 Name",
    ],
    [
      "Falls through to nameHint when DB name is empty string",
      { dbName: "", nameHint: "Auth0 Name", email: EMAIL },
      "Auth0 Name",
    ],
    [
      "Falls through to email as last resort when both DB name and hint are empty",
      { dbName: "", nameHint: "", email: EMAIL },
      EMAIL,
    ],
    [
      "Falls through to email when nameHint is undefined and DB name is missing",
      { dbName: null, nameHint: undefined, email: EMAIL },
      EMAIL,
    ],
  ])("%s", (_label, input, expected) => {
    expect(resolveDisplayName(input)).toBe(expected);
  });
});
