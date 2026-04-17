export interface CourtConfig {
  path: string;         // AustLII TOC path, e.g. "au/cases/cth/HCA"
  jurisdiction: string; // e.g. "cth", "nsw", "vic"
  court: string;        // e.g. "HCA", "FCA", "NSWSC"
  label: string;        // Human-readable name
}

export const AUSTLII_COURTS: CourtConfig[] = [
  // Commonwealth
  { path: "au/cases/cth/HCA", jurisdiction: "cth", court: "HCA", label: "High Court of Australia" },
  { path: "au/cases/cth/FCA", jurisdiction: "cth", court: "FCA", label: "Federal Court of Australia" },
  { path: "au/cases/cth/FCAFC", jurisdiction: "cth", court: "FCAFC", label: "Full Federal Court" },

  // New South Wales
  { path: "au/cases/nsw/NSWSC", jurisdiction: "nsw", court: "NSWSC", label: "NSW Supreme Court" },
  { path: "au/cases/nsw/NSWCA", jurisdiction: "nsw", court: "NSWCA", label: "NSW Court of Appeal" },
  { path: "au/cases/nsw/NSWCCA", jurisdiction: "nsw", court: "NSWCCA", label: "NSW Court of Criminal Appeal" },
  { path: "au/cases/nsw/NSWDC", jurisdiction: "nsw", court: "NSWDC", label: "NSW District Court" },

  // Victoria
  { path: "au/cases/vic/VSC", jurisdiction: "vic", court: "VSC", label: "Victorian Supreme Court" },
  { path: "au/cases/vic/VSCA", jurisdiction: "vic", court: "VSCA", label: "Victorian Court of Appeal" },

  // Queensland
  { path: "au/cases/qld/QSC", jurisdiction: "qld", court: "QSC", label: "Queensland Supreme Court" },
  { path: "au/cases/qld/QCA", jurisdiction: "qld", court: "QCA", label: "Queensland Court of Appeal" },

  // South Australia
  { path: "au/cases/sa/SASC", jurisdiction: "sa", court: "SASC", label: "SA Supreme Court" },
  { path: "au/cases/sa/SASCFC", jurisdiction: "sa", court: "SASCFC", label: "SA Supreme Court Full Court" },

  // Western Australia
  { path: "au/cases/wa/WASC", jurisdiction: "wa", court: "WASC", label: "WA Supreme Court" },
  { path: "au/cases/wa/WASCA", jurisdiction: "wa", court: "WASCA", label: "WA Court of Appeal" },
];

// Default: crawl recent years only for initial testing
export const DEFAULT_START_YEAR = 2023;
export const DEFAULT_END_YEAR = new Date().getFullYear();

// Rate limiting: milliseconds between requests
export const REQUEST_DELAY_MS = 10_000;
