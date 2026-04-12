import { router } from "./trpc";
import { organizationRouter } from "./routers/organization";
import { serviceRouter } from "./routers/service";
import { clientRouter } from "./routers/client";
import { staffRouter } from "./routers/staff";
import { appointmentRouter } from "./routers/appointment";
import { availabilityRouter } from "./routers/availability";
import { aiRouter } from "./routers/ai";
import { analyticsRouter } from "./routers/analytics";
import { paymentRouter } from "./routers/payment";
import { insightsRouter } from "./routers/insights";
import { competitiveRouter } from "./routers/competitive";
import { waitlistRouter } from "./routers/waitlist";
import { reviewRouter } from "./routers/review";
import { importRouter } from "./routers/import";
import { recurrenceRouter } from "./routers/recurrence";
import { packageRouter } from "./routers/package";
import { intakeFormRouter } from "./routers/intake-form";
import { calendarSyncRouter } from "./routers/calendar-sync";
import { portalRouter } from "./routers/portal";
import { campaignRouter } from "./routers/campaign";
import { locationRouter } from "./routers/location";
import { payrollRouter } from "./routers/payroll";
import { reportsRouter } from "./routers/reports";

export const appRouter = router({
  organization: organizationRouter,
  service: serviceRouter,
  client: clientRouter,
  staff: staffRouter,
  appointment: appointmentRouter,
  availability: availabilityRouter,
  ai: aiRouter,
  analytics: analyticsRouter,
  payment: paymentRouter,
  insights: insightsRouter,
  competitive: competitiveRouter,
  waitlist: waitlistRouter,
  review: reviewRouter,
  import: importRouter,
  recurrence: recurrenceRouter,
  package: packageRouter,
  intakeForm: intakeFormRouter,
  calendarSync: calendarSyncRouter,
  portal: portalRouter,
  campaign: campaignRouter,
  location: locationRouter,
  payroll: payrollRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
