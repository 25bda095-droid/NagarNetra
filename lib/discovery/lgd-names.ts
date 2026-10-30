// Name normalisation shared by the LGD importer and the live matcher.
// LGD says "Municipal Council Kupwara", OpenStreetMap says "Kupwara": we compare the "core"
// names with generic governance words removed. The list holds only India-wide terms, no place names.

const GOVERNANCE_TERMS = [
  // urban bodies
  "municipal corporation", "mahanagar palika", "mahanagarpalika", "mahanagara palike", "nagara palike",
  "pattana panchayat", "town municipality", "nagar nigam", "city corporation",
  "city municipal council", "town municipal council", "nct municipal council", "municipal council",
  "municipal committee", "municipal board", "municipality", "nagar palika parishad", "nagar palika",
  "nagarpalika", "nagar parishad", "nagar panchayat", "town panchayat", "notified area council",
  "notified area committee", "industrial township", "cantonment board", "town area committee",
  // rural bodies
  "gram panchayat", "grama panchayat", "gaon panchayat", "village panchayat", "halqa panchayat",
  "panchayat samiti", "zila parishad", "zilla parishad", "zila panchayat", "zilla panchayat",
  "district panchayat", "block panchayat", "mandal panchayat", "taluka panchayat", "janpad panchayat",
  "kshetra panchayat", "anchalik panchayat", "commune panchayat", "block development council",
  "district planning development board", "village council",
  // administrative words
  "district", "sub district", "subdistrict", "tehsil", "taluka", "taluk", "mandal", "block",
  "corporation", "panchayat",
];

// longest first, so "city municipal council" is removed before "municipal council"
const TERM_PATTERNS = [...GOVERNANCE_TERMS]
  .sort((a, b) => b.length - a.length)
  .map((term) => new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`, "g"));

// Lowercase, turn punctuation into spaces, collapse whitespace.
export function basicName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The distinctive part of a body's name, e.g. "Greater Hyderabad Municipal Corporation" -> "greater hyderabad".
// Falls back to the basic name when removing the terms would leave nothing.
export function coreName(name: string): string {
  const basic = basicName(name);
  let core = basic;
  for (const pattern of TERM_PATTERNS) core = core.replace(pattern, " ");
  core = core.replace(/\s+/g, " ").trim();
  return core || basic;
}
