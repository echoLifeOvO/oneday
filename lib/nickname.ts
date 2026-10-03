type PublicationKind = "diary" | "comment" | "local";
const prefixes: Record<PublicationKind, string> = { diary: "D", comment: "C", local: "L" };

// Encode the complete primary key, not a truncated random suffix. Distinct UUIDs
// stay distinct, and namespaces separate diary/comment/local-preview records.
export function nickname(locale: "zh" | "en", recordId: string, kind: PublicationKind) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) throw new Error("INVALID_NICKNAME_ID");
  const token = BigInt(`0x${recordId.replaceAll("-", "")}`).toString(36).padStart(25, "0");
  return `${locale === "en" ? "Traveler" : "旅人"} ${prefixes[kind]}-${token}`;
}
