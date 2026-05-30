import { describe, expect, it } from "vitest";
import {
  compactRawItem,
  descriptionFromItem,
  flattenLandscape,
  itemRef,
  itemSubjectId,
  labelsFromItem,
  logoUrl,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parseItemSubjectId,
  parseLandscapeYaml,
  priorityFromItem,
  statusFromItem,
  subjectFromItem,
  toIso,
  truncate,
  type Config,
  type FlattenedLandscapeItem,
  type LandscapeDocument,
} from "./index";

const config: Config = {
  landscapeUrl: "https://raw.githubusercontent.com/cncf/landscape/master/landscape.yml",
  limit: 100,
};

const document: LandscapeDocument = {
  landscape: [
    {
      name: "Provisioning",
      subcategories: [
        {
          name: "Automation & Configuration",
          items: [
            {
              name: "Akri",
              homepage_url: "https://docs.akri.sh",
              project: "sandbox",
              repo_url: "https://github.com/project-akri/akri",
              logo: "akri.svg",
              twitter: "https://twitter.com/ProjectAkri",
              crunchbase: "https://www.crunchbase.com/organization/cloud-native-computing-foundation",
              extra: {
                lfx_slug: "akri",
                accepted: "2021-09-14",
                annual_review_date: "2023-06-13",
                annual_review_url: "https://github.com/cncf/toc/pull/1080",
                dev_stats_url: "https://akri.devstats.cncf.io/",
                artwork_url: "https://github.com/cncf/artwork/blob/master/examples/sandbox_a-j.md#akri-logos",
                clomonitor_name: "akri",
              },
            },
            {
              name: "AWS CloudFormation",
              description: "AWS CloudFormation provisions cloud resources.",
              homepage_url: "https://aws.amazon.com/cloudformation/",
              logo: "aws-cloudformation.svg",
              open_source: false,
            },
          ],
        },
      ],
    },
  ],
};

const akri: FlattenedLandscapeItem = flattenLandscape(document)[0]!;
const cloudFormation: FlattenedLandscapeItem = flattenLandscape(document)[1]!;

describe("CNCF Landscape helpers", () => {
  it("flattens landscape YAML and builds subject ids", () => {
    const yaml = [
      "landscape:",
      "  - category:",
      "    name: Provisioning",
      "    subcategories:",
      "      - subcategory:",
      "        name: Automation & Configuration",
      "        items:",
      "          - item:",
      "            name: Akri",
      "            project: sandbox",
      "            homepage_url: https://docs.akri.sh",
      "            repo_url: https://github.com/project-akri/akri",
    ].join("\n");
    expect(parseLandscapeYaml(yaml)).toHaveLength(1);
    expect(itemRef(akri)).toBe("provisioning/automation-and-configuration/akri");
    expect(itemSubjectId(akri)).toBe("cncf.landscape_item:provisioning/automation-and-configuration/akri");
    expect(parseItemSubjectId("cncf.landscape_item:provisioning/automation-and-configuration/akri")).toBe("provisioning/automation-and-configuration/akri");
  });

  it("maps items to subjects", () => {
    const subject = subjectFromItem(akri, "2026-05-30T21:30:00.000Z");
    expect(subject.id).toBe("cncf.landscape_item:provisioning/automation-and-configuration/akri");
    expect(subject.kind).toBe("cncf.landscape_item");
    expect(subject.title).toBe("Akri");
    expect(subject.status).toBe("done");
    expect(subject.native_status).toBe("cncf-sandbox");
    expect(subject.priority).toBe(3);
    expect(subject.assignee).toBe("CNCF");
    expect(subject.created_at).toBe("2021-09-14T00:00:00.000Z");
    expect(subject.updated_at).toBe("2023-06-13T00:00:00.000Z");
    expect(subject.url).toBe("https://docs.akri.sh");
    expect(subject.custom?.lfx_slug).toBe("akri");
    expect(subject.custom?.clomonitor_name).toBe("akri");
  });

  it("formats status, labels, logo URLs, and descriptions", () => {
    expect(nativeStatus(akri)).toBe("cncf-sandbox");
    expect(nativeStatus(cloudFormation)).toBe("proprietary");
    expect(statusFromItem(akri)).toBe("done");
    expect(priorityFromItem({ ...akri, item: { ...akri.item, project: "graduated" } })).toBe(1);
    expect(priorityFromItem(cloudFormation)).toBe(5);
    expect(labelsFromItem(akri)).toContain("project:sandbox");
    expect(labelsFromItem(akri)).toContain("category:provisioning");
    expect(labelsFromItem(akri)).toContain("subcategory:automation-and-configuration");
    expect(logoUrl(akri.item)).toBe("https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos/akri.svg");
    expect(descriptionFromItem(akri)).toBe("CNCF Landscape item in Provisioning / Automation & Configuration");
    expect(descriptionFromItem(cloudFormation)).toBe("AWS CloudFormation provisions cloud resources.");
  });

  it("filters items", () => {
    expect(matchesConfiguredFilters({ ...config, query: "akri" }, akri)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, query: "does-not-match" }, akri)).toBe(false);
    expect(matchesConfiguredFilters({ ...config, category: "automation" }, akri)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, category: "runtime" }, akri)).toBe(false);
    expect(matchesConfiguredFilters({ ...config, project: "sandbox" }, akri)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, project: "none" }, cloudFormation)).toBe(true);
    expect(matchesFilters(config, akri, { labels_all: ["cncf", "cloud-native", "has-repo"] })).toBe(true);
    expect(matchesFilters(config, akri, { status: ["ready"] })).toBe(false);
  });

  it("handles dates and compact raw data", () => {
    expect(toIso("2023-06-13", "fallback")).toBe("2023-06-13T00:00:00.000Z");
    expect(toIso("not-a-date", "fallback")).toBe("fallback");
    expect(truncate("abcdef", 4)).toBe("a...");
    const raw = compactRawItem({ ...akri.item, description: "a".repeat(1200) });
    expect(String(raw.description)).toHaveLength(1000);
  });
});
