export type HttpHeaders = Record<string, string>;

export type WordPressDetection = {
  isWordpress: boolean;
  signals: string[];
};

export type ThemeInfo = {
  slug: string;
  name?: string;
  version?: string;
  author?: string;
  authorUri?: string;
  description?: string;
  styleCssUrl?: string;
};

export type PluginInfo = {
  slug: string;
  versionHints: string[]; // best-effort
};

export type HostingHints = {
  finalUrl: string;
  status: number;
  server?: string;
  poweredBy?: string;
  cdn?: string;
  cache?: string;
  contentEncoding?: string;
  cacheControl?: string;
};

export type SecurityHints = {
  xmlrpcAccessible?: boolean;
  wpLoginAccessible?: boolean;
  securityHeaders: {
    hsts: boolean;
    csp: boolean;
    xFrame: boolean;
    xcto: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
  };
};

export type PerformanceHints = {
  ttfbMs?: number;
  htmlBytes?: number;
};

export type VulnSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'None' | 'Unknown';

export type VulnerabilitySummary = {
  id: string; // UUID
  title: string;
  cve?: string | null;
  cvssScore?: number | null;
  cvssRating: VulnSeverity;
  published?: string | null; // UTC string
  updated?: string | null;
  software: Array<{ type: 'core' | 'plugin' | 'theme'; slug: string; name?: string | null }>; // simplified
  referenceUrl?: string | null;
  remediation?: string | null;
  patchedVersions?: string[];
};

export type ComponentSet = {
  core?: { versionHint?: string };
  theme?: { slug: string; versionHint?: string };
  plugins: Array<{ slug: string; versionHint?: string }>;
};

export type AnalysisResult = {
  origin: string;
  finalUrl: string;
  wordpress: WordPressDetection;
  theme?: ThemeInfo;
  plugins: PluginInfo[];
  hosting: HostingHints;
  security: SecurityHints;
  performance: PerformanceHints;
  components: ComponentSet;
  vulns?: {
    recentGlobalCriticalHigh: VulnerabilitySummary[];
    recentForComponentsCriticalHigh: VulnerabilitySummary[];
  };
};
