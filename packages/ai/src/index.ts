export { processMessage } from "./agent";
export { buildAiContext } from "./context-builder";
export { executeFunctionCall } from "./executor";
export { BUSINESS_FUNCTIONS, CLIENT_FUNCTIONS } from "./functions";
export { detectUIBlocks } from "./ui-blocks";
export { generateCoachInsights } from "./insights";
export type {
  Insight,
  InsightPriority,
  InsightCategory,
  RevenueSnapshot,
  CoachSummary,
} from "./insights";
export { generateCompetitiveReport, getCompetitorDetails } from "./competitive";
export {
  scoreAppointment,
  scoreUpcomingAppointments,
  getHighRiskAppointments,
} from "./no-show-predictor";
export { generateCampaignMessage } from "./campaigns";
export {
  generateOptimizationReport,
  getUtilizationSummary,
} from "./scheduling-optimizer";
export type {
  Competitor,
  CompetitorDetail,
  CompetitiveReport,
  CompetitiveInsight,
  PricingComparison,
} from "./competitive";
