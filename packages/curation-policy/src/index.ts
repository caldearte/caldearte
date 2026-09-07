// Single source of truth for the curation editorial policy text (see
// docs/curation-policy.md) plus the axis-5 vision check that depends on
// it, shared between apps/curator (batch scraped-source curation) and
// apps/web (the "agrega tu expo" form's synchronous single-submission
// curation) — moved here 2026-08-31 so the policy text can't drift
// between two copies. Content unchanged from apps/curator/src/lib/.
export {
  ART_SCOPE_POLICY,
  TEXT_CURATION_POLICY,
  EVENT_TYPE_POLICY,
  VISION_AXIS5_POLICY,
  INSTITUTIONAL_EXCLUSION_POLICY,
  REJECTION_AXIS_POLICY,
  REJECTION_AXES,
  isRejectionAxis,
  type RejectionAxis,
} from "./policy";
export { isSafeExternalUrl } from "./url-safety";
export {
  runVisionCheck,
  defaultImageFetcher,
  type ImageFetcher,
  type VisionMessagesClient,
  type VisionUsage,
} from "./vision-check";
