import { definePlugin, PluginKind, type Subject, type SubjectBackend, type SubjectListParams, type SubjectStatus } from "@launchapp-dev/animus-plugin-sdk";
import YAML from "yaml";

const NAME = "animus-subject-cncf-landscape-items";
const VERSION = "0.1.0";
const SUBJECT_KIND = "cncf.landscape_item";
const DEFAULT_LANDSCAPE_URL = "https://raw.githubusercontent.com/cncf/landscape/master/landscape.yml";
const DEFAULT_LANDSCAPE_HOME = "https://landscape.cncf.io/";
const DEFAULT_LOGO_BASE_URL = "https://raw.githubusercontent.com/cncf/landscape/master/hosted_logos";

interface Config {
  landscapeUrl: string;
  query?: string;
  category?: string;
  project?: string;
  limit: number;
}

interface LandscapeDocument {
  landscape?: LandscapeCategory[];
}

interface LandscapeCategory {
  category?: unknown;
  name?: string;
  subcategories?: LandscapeSubcategory[];
  [key: string]: unknown;
}

interface LandscapeSubcategory {
  subcategory?: unknown;
  name?: string;
  items?: LandscapeItem[];
  [key: string]: unknown;
}

interface LandscapeItem {
  item?: unknown;
  name?: string;
  description?: string;
  homepage_url?: string;
  repo_url?: string;
  project?: string;
  logo?: string;
  twitter?: string;
  crunchbase?: string;
  open_source?: boolean;
  second_path?: string[];
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

interface FlattenedLandscapeItem {
  category: string;
  subcategory: string;
  item: LandscapeItem;
}

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw === "" ? undefined : raw;
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function readConfig(): Config {
  return {
    landscapeUrl: optionalEnv("CNCF_LANDSCAPE_URL") ?? DEFAULT_LANDSCAPE_URL,
    query: optionalEnv("CNCF_QUERY"),
    category: optionalEnv("CNCF_CATEGORY"),
    project: optionalEnv("CNCF_PROJECT"),
    limit: readPositiveInt(optionalEnv("CNCF_LIMIT"), 100, 1000),
  };
}

function normalized(value: string | number | undefined | null, maxLength = 80): string | undefined {
  const trimmed = value === undefined || value === null ? undefined : String(value).trim();
  if (!trimmed) return undefined;
  const slug = trimmed.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "") || undefined;
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function itemName(item: LandscapeItem): string {
  const name = item.name?.trim();
  if (!name) throw new Error("CNCF Landscape item is missing name");
  return name;
}

function itemRef(flat: FlattenedLandscapeItem): string {
  const category = normalized(flat.category);
  const subcategory = normalized(flat.subcategory);
  const name = normalized(itemName(flat.item));
  if (!category || !subcategory || !name) throw new Error("CNCF Landscape item path is incomplete");
  return `${category}/${subcategory}/${name}`;
}

function itemSubjectId(flatOrRef: FlattenedLandscapeItem | string): string {
  const ref = typeof flatOrRef === "string" ? flatOrRef.trim() : itemRef(flatOrRef);
  if (!ref) throw new Error("CNCF Landscape item ref is empty");
  return `${SUBJECT_KIND}:${ref}`;
}

function parseItemSubjectId(id: string): string {
  const raw = id.startsWith(`${SUBJECT_KIND}:`) ? id.slice(`${SUBJECT_KIND}:`.length) : id;
  const parsed = decodeURIComponent(raw).trim();
  if (!parsed) throw new Error(`expected id '${SUBJECT_KIND}:<category>/<subcategory>/<item>', got '${id}'`);
  return parsed;
}

function toIso(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function rawExtraString(item: LandscapeItem, key: string): string | undefined {
  const value = item.extra?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function logoUrl(item: LandscapeItem): string | undefined {
  if (!item.logo) return undefined;
  if (/^https?:\/\//i.test(item.logo)) return item.logo;
  return `${DEFAULT_LOGO_BASE_URL}/${encodeURIComponent(item.logo)}`;
}

function nativeStatus(flat: FlattenedLandscapeItem): string {
  const project = normalized(flat.item.project);
  if (project) return `cncf-${project}`;
  if (flat.item.open_source === false) return "proprietary";
  if (flat.item.repo_url) return "open-source";
  return "listed";
}

function statusFromItem(_flat: FlattenedLandscapeItem): SubjectStatus {
  return "done";
}

function priorityFromItem(flat: FlattenedLandscapeItem): number {
  const project = normalized(flat.item.project);
  if (project === "graduated") return 1;
  if (project === "incubating") return 2;
  if (project === "sandbox") return 3;
  if (flat.item.repo_url) return 4;
  return 5;
}

function labelsFromItem(flat: FlattenedLandscapeItem): string[] {
  const labels = new Set<string>([
    "cncf",
    "cloud-native",
    nativeStatus(flat),
    `category:${normalized(flat.category) ?? flat.category}`,
    `subcategory:${normalized(flat.subcategory) ?? flat.subcategory}`,
  ]);
  if (flat.item.project) labels.add(`project:${normalized(flat.item.project) ?? flat.item.project}`);
  if (flat.item.repo_url) labels.add("has-repo");
  labels.add(flat.item.open_source === false ? "proprietary" : "open-source");
  const tag = rawExtraString(flat.item, "tag");
  if (tag) labels.add(`tag:${normalized(tag) ?? tag}`);
  return [...labels];
}

function descriptionFromItem(flat: FlattenedLandscapeItem): string {
  return flat.item.description?.trim() || `CNCF Landscape item in ${flat.category} / ${flat.subcategory}`;
}

function subjectUrl(item: LandscapeItem): string {
  return item.homepage_url ?? item.repo_url ?? DEFAULT_LANDSCAPE_HOME;
}

function compactRawItem(item: LandscapeItem): Record<string, unknown> {
  return {
    ...item,
    description: truncate(item.description, 1000),
  };
}

function subjectFromItem(flat: FlattenedLandscapeItem, fetchedAt = new Date().toISOString()): Subject {
  const accepted = rawExtraString(flat.item, "accepted");
  const annualReviewDate = rawExtraString(flat.item, "annual_review_date");
  return {
    id: itemSubjectId(flat),
    kind: SUBJECT_KIND,
    title: itemName(flat.item),
    description: descriptionFromItem(flat),
    status: statusFromItem(flat),
    created_at: toIso(accepted, fetchedAt),
    updated_at: toIso(annualReviewDate ?? accepted, fetchedAt),
    labels: labelsFromItem(flat),
    assignee: flat.item.project ? "CNCF" : undefined,
    url: subjectUrl(flat.item),
    native_status: nativeStatus(flat),
    priority: priorityFromItem(flat),
    custom: {
      name: itemName(flat.item),
      ref: itemRef(flat),
      category: flat.category,
      subcategory: flat.subcategory,
      project: flat.item.project,
      homepage_url: flat.item.homepage_url,
      repo_url: flat.item.repo_url,
      logo: flat.item.logo,
      logo_url: logoUrl(flat.item),
      twitter: flat.item.twitter,
      crunchbase: flat.item.crunchbase,
      open_source: flat.item.open_source ?? Boolean(flat.item.repo_url),
      second_path: flat.item.second_path ?? [],
      lfx_slug: rawExtraString(flat.item, "lfx_slug"),
      clomonitor_name: rawExtraString(flat.item, "clomonitor_name"),
      accepted,
      annual_review_date: annualReviewDate,
      annual_review_url: rawExtraString(flat.item, "annual_review_url"),
      dev_stats_url: rawExtraString(flat.item, "dev_stats_url"),
      artwork_url: rawExtraString(flat.item, "artwork_url"),
      blog_url: rawExtraString(flat.item, "blog_url"),
      extra: flat.item.extra ?? {},
      raw: compactRawItem(flat.item),
    },
  };
}

function flattenLandscape(document: LandscapeDocument): FlattenedLandscapeItem[] {
  const items: FlattenedLandscapeItem[] = [];
  for (const categoryNode of document.landscape ?? []) {
    const category = categoryNode.name?.trim();
    if (!category) continue;
    for (const subcategoryNode of categoryNode.subcategories ?? []) {
      const subcategory = subcategoryNode.name?.trim();
      if (!subcategory) continue;
      for (const item of subcategoryNode.items ?? []) {
        if (!item.name?.trim()) continue;
        items.push({ category, subcategory, item });
      }
    }
  }
  return items;
}

function parseLandscapeYaml(source: string): FlattenedLandscapeItem[] {
  const document = YAML.parse(source) as LandscapeDocument;
  return flattenLandscape(document);
}

function matchesConfiguredFilters(config: Config, flat: FlattenedLandscapeItem): boolean {
  if (config.project) {
    const needle = normalized(config.project);
    const project = normalized(flat.item.project);
    if (needle === "none") {
      if (project) return false;
    } else if (needle !== project) {
      return false;
    }
  }
  if (config.category) {
    const needle = config.category.toLowerCase();
    const path = `${flat.category} ${flat.subcategory}`.toLowerCase();
    if (!path.includes(needle)) return false;
  }
  if (!config.query) return true;
  const needle = config.query.toLowerCase();
  const haystack = [
    itemName(flat.item),
    flat.item.description,
    flat.category,
    flat.subcategory,
    flat.item.project,
    flat.item.homepage_url,
    flat.item.repo_url,
    flat.item.twitter,
    flat.item.crunchbase,
    rawExtraString(flat.item, "lfx_slug"),
    rawExtraString(flat.item, "clomonitor_name"),
    rawExtraString(flat.item, "tag"),
    ...(flat.item.second_path ?? []),
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function matchesFilters(config: Config, flat: FlattenedLandscapeItem, params: SubjectListParams): boolean {
  if (!matchesConfiguredFilters(config, flat)) return false;
  const subject = subjectFromItem(flat);
  if (params.status && params.status.length > 0 && !params.status.includes(subject.status)) return false;
  if (params.assignee && params.assignee.length > 0 && (!subject.assignee || !params.assignee.includes(subject.assignee))) return false;
  const labels = new Set(subject.labels ?? []);
  if (params.labels_all && !params.labels_all.every((label) => labels.has(label))) return false;
  if (params.labels_any && params.labels_any.length > 0 && !params.labels_any.some((label) => labels.has(label))) return false;
  if (params.updated_since && new Date(subject.updated_at) < new Date(params.updated_since)) return false;
  return true;
}

class CncfLandscapeClient {
  constructor(private readonly config: Config) {}

  async requestText(): Promise<string> {
    const headers = new Headers();
    headers.set("Accept", "application/x-yaml,text/yaml,text/plain,*/*");
    headers.set("User-Agent", `${NAME}/${VERSION} (https://github.com/launchapp-dev/${NAME})`);
    const response = await fetch(this.config.landscapeUrl, { headers });
    const text = await response.text();
    if (!response.ok) throw new Error(`CNCF Landscape ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return text;
  }

  async listAll(): Promise<FlattenedLandscapeItem[]> {
    return parseLandscapeYaml(await this.requestText());
  }

  async list(): Promise<FlattenedLandscapeItem[]> {
    return (await this.listAll()).filter((flat) => matchesConfiguredFilters(this.config, flat)).slice(0, this.config.limit);
  }

  async get(ref: string): Promise<FlattenedLandscapeItem> {
    const decoded = decodeURIComponent(ref);
    const item = (await this.listAll()).find((flat) => itemRef(flat) === decoded);
    if (!item) throw new Error(`CNCF Landscape item '${ref}' was not found`);
    return item;
  }
}

function buildBackend(): SubjectBackend {
  let cached: { client: CncfLandscapeClient; config: Config } | null = null;
  const runtime = (): { client: CncfLandscapeClient; config: Config } => {
    if (!cached) {
      const config = readConfig();
      cached = { client: new CncfLandscapeClient(config), config };
    }
    return cached;
  };
  return {
    async list(params) {
      const { client, config } = runtime();
      const items = await client.list();
      return {
        subjects: items.filter((item) => matchesFilters(config, item, params)).map((item) => subjectFromItem(item)),
        next_cursor: null,
        fetched_at: new Date().toISOString(),
      };
    },
    async get(params) {
      const { client } = runtime();
      return subjectFromItem(await client.get(parseItemSubjectId(params.id)));
    },
    schema() {
      return {
        kinds: [SUBJECT_KIND],
        status_values: ["ready", "in-progress", "blocked", "done", "cancelled"],
        supports_watch: false,
        supports_create: false,
        supports_pagination: false,
        native_status_values: ["listed", "open-source", "proprietary", "cncf-sandbox", "cncf-incubating", "cncf-graduated"],
        status_dispatch_hints: [
          { native_status: "listed", status: "done" },
          { native_status: "open-source", status: "done" },
          { native_status: "proprietary", status: "done" },
          { native_status: "cncf-sandbox", status: "done" },
          { native_status: "cncf-incubating", status: "done" },
          { native_status: "cncf-graduated", status: "done" },
        ],
        custom_fields: [
          "name",
          "ref",
          "category",
          "subcategory",
          "project",
          "homepage_url",
          "repo_url",
          "logo",
          "logo_url",
          "twitter",
          "crunchbase",
          "open_source",
          "second_path",
          "lfx_slug",
          "clomonitor_name",
          "accepted",
          "annual_review_date",
          "annual_review_url",
          "dev_stats_url",
          "artwork_url",
          "blog_url",
          "extra",
          "raw",
        ],
      };
    },
    async health() {
      try {
        const { client } = runtime();
        const items = await client.list();
        return items.length > 0 ? { status: "healthy", uptime_ms: null, memory_usage_bytes: null, last_error: null } : { status: "unhealthy", uptime_ms: null, memory_usage_bytes: null, last_error: "CNCF Landscape returned no items" };
      } catch (err) {
        return { status: "unhealthy", uptime_ms: null, memory_usage_bytes: null, last_error: String(err) };
      }
    },
  };
}

export {
  CncfLandscapeClient,
  compactRawItem,
  descriptionFromItem,
  flattenLandscape,
  itemName,
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
  type LandscapeItem,
};

const plugin = definePlugin({
  kind: PluginKind.SubjectBackend,
  name: NAME,
  version: VERSION,
  description: "CNCF Landscape items subject backend plugin for Animus",
  subject_kinds: [SUBJECT_KIND],
  env_required: [
    { name: "CNCF_LANDSCAPE_URL", description: "Optional CNCF landscape.yml URL. Defaults to the official cncf/landscape raw landscape.yml.", required: false },
    { name: "CNCF_QUERY", description: "Optional local text query across item names, descriptions, paths, project maturity, URLs, and metadata.", required: false },
    { name: "CNCF_CATEGORY", description: "Optional category or subcategory text filter.", required: false },
    { name: "CNCF_PROJECT", description: "Optional CNCF project maturity filter, such as sandbox, incubating, graduated, or none.", required: false },
    { name: "CNCF_LIMIT", description: "Optional maximum item count from 1 to 1000. Defaults to 100.", required: false },
  ],
  impl: buildBackend(),
});

function isDirectRun(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("index.cjs") || entry.endsWith("index.js") || entry.endsWith(NAME);
}

if (isDirectRun()) {
  plugin.run().catch((err) => {
    process.stderr.write(`[${NAME}] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
