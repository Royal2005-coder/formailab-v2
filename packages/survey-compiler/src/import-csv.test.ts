import { describe, expect, test } from "vitest";
import { importLegacyCsv } from "./import-csv";

const csv = `class,type/scale,name,relevance,text,help,language,mandatory,order,calculation,parent_external_id,external_id
S,,DEMO,,Demo survey,,en-US,,0,,,
SL,,DEMO,,,Survey language,vi,,,,,
G,,PROFILE,,Profile,,en-US,,1,,,PROFILE
Q,L,ROLE,,What is your role?,Choose one,en-US,Y,1,,,ROLE
A,,student,,Student,,en-US,,1,,,
A,,researcher,,Researcher,,en-US,,2,,,
SQ,,other,,Other row,,en-US,,3,,ROLE,
V,number,SCORE,,,,en-US,,,sum(ROLE),,SCORE
R,,ROLE,"ROLE != """"",,,,N,,,ROLE,
`;

describe("importLegacyCsv", () => {
  test("compiles legacy contextual rows into a canonical preview", () => {
    const result = importLegacyCsv(csv);
    expect(result.diagnostics).toEqual([]);
    expect(result.canonicalSurvey?.questions[0]).toMatchObject({
      externalId: "ROLE",
      groupExternalId: "PROFILE",
      type: "singleChoice",
      mandatory: true,
      relevance: 'ROLE != ""',
      options: [
        { externalId: "ROLE_A_student", value: "student" },
        { externalId: "ROLE_A_researcher", value: "researcher" },
        { externalId: "ROLE_SQ_other", value: "other" },
      ],
    });
  });

  test("returns stable source and canonical SHA-256 checksums", () => {
    const first = importLegacyCsv(csv);
    const second = importLegacyCsv(csv);
    expect(first.sourceChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.canonicalChecksum).toBe(second.canonicalChecksum);
    expect(first.sourceChecksum).toBe(second.sourceChecksum);
  });

  test("validateOnly validates without returning preview data", () => {
    const result = importLegacyCsv(csv, { mode: "validateOnly" });
    expect(result.mode).toBe("validateOnly");
    expect(result.canonicalSurvey).toBeUndefined();
    expect(result.canonicalChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  test("reports dangling references with source location", () => {
    const result = importLegacyCsv(`${csv}A,,orphan,,Orphan,,en-US,,1,,MISSING,ORPHAN\n`);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "csv.option.question_missing",
        externalId: "MISSING_A_ORPHAN",
        source: expect.objectContaining({ sheet: "CSV", column: "parent_external_id" }),
      })
    );
  });

  test("accepts an UTF-8 BOM and localized text", () => {
    const result = importLegacyCsv(`\uFEFF${csv.replace("Demo survey", "Khảo sát AI")}`);
    expect(result.canonicalSurvey?.title["en-US"]).toBe("Khảo sát AI");
  });

  test("handles duplicate external IDs like G_PROFILE across group and question rows gracefully without error", () => {
    const duplicateIdCsv = `class,type/scale,name,relevance,text,help,language,mandatory,order,calculation,parent_external_id,external_id
S,,DEMO,,Demo survey,,en-US,,0,,,
G,,G_PROFILE,,Demographics 1,,en-US,,1,,,G_PROFILE
G,,G_PROFILE,,Demographics 2 (localized),,vi,,1,,,G_PROFILE
Q,L,G_PROFILE,,What is your profile?,Choose one,en-US,Y,1,,,G_PROFILE
A,,opt1,,Option 1,,en-US,,1,,,
V,string,G_PROFILE,,,,en-US,,,calc,,G_PROFILE
`;
    const result = importLegacyCsv(duplicateIdCsv);
    expect(result.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(result.canonicalSurvey?.groups).toHaveLength(1);
    expect(result.canonicalSurvey?.groups[0].title).toEqual({
      "en-US": "Demographics 1",
      vi: "Demographics 2 (localized)",
    });
    expect(result.canonicalSurvey?.questions[0].externalId).toBe("G_PROFILE_Q1");
    expect(result.canonicalSurvey?.variables[0].externalId).toBe("G_PROFILE_V1");
  });
});
