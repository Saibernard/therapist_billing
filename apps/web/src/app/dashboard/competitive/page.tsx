"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Radar,
  Star,
  MapPin,
  DollarSign,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertTriangle,
  Lightbulb,
  Trophy,
  Users,
  TrendingUp,
  TrendingDown,
  Loader2,
  Phone,
  Globe,
  Clock,
  MessageSquare,
  Search,
  SlidersHorizontal,
} from "lucide-react";

// ── Types (matching the API) ───────────────────────────────────────

type InsightType = "opportunity" | "threat" | "info";

const INSIGHT_STYLES: Record<
  InsightType,
  { bg: string; icon: typeof TrendingUp; label: string }
> = {
  opportunity: {
    bg: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    icon: TrendingUp,
    label: "Opportunity",
  },
  threat: {
    bg: "bg-red-500/10 text-red-600 border-red-500/20",
    icon: AlertTriangle,
    label: "Threat",
  },
  info: {
    bg: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    icon: Lightbulb,
    label: "Insight",
  },
};

// ── Main Page ──────────────────────────────────────────────────────

export default function CompetitivePage() {
  const [radius, setRadius] = useState(8);
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(
    null
  );
  const [categoryInput, setCategoryInput] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  const { data, isLoading, error, refetch } =
    trpc.competitive.report.useQuery(
      { radiusKm: radius },
      { refetchOnWindowFocus: false, staleTime: 10 * 60 * 1000 }
    );

  const updateCategory = trpc.competitive.updateCategory.useMutation({
    onSuccess: () => {
      setShowCategoryForm(false);
      refetch();
    },
  });

  const detailQuery = trpc.competitive.competitorDetail.useQuery(
    { placeId: expandedCompetitor ?? "" },
    { enabled: !!expandedCompetitor }
  );

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Radar className="h-12 w-12 text-accent animate-pulse" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">
              Scanning your market…
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Analyzing competitors, ratings, and pricing
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <p className="font-medium text-foreground">
            Couldn&apos;t load competitive data
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasCompetitors = data.competitors.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-8">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
            <Radar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Competitive Intel
            </h1>
            <p className="text-sm text-muted-foreground">
              {hasCompetitors
                ? `${data.totalFound} competitors within ${data.radius}km`
                : "Set up to start monitoring"}
            </p>
          </div>
        </div>

        {hasCompetitors && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="bg-transparent text-sm font-medium text-foreground outline-none"
              >
                <option value={3}>3 km</option>
                <option value={5}>5 km</option>
                <option value={8}>8 km</option>
                <option value={15}>15 km</option>
                <option value={25}>25 km</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Updated{" "}
              {new Date(data.lastUpdated).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>

      {/* ── Scorecard (your position vs market) ─────────────── */}
      {hasCompetitors && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreCard
            label="Your Rating"
            value={
              data.yourRating !== null ? `${data.yourRating}★` : "No listing"
            }
            sub={
              data.yourReviewCount !== null
                ? `${data.yourReviewCount} reviews`
                : "Claim your Google profile"
            }
            comparison={
              data.yourRating !== null
                ? `Market avg: ${data.avgCompetitorRating}★`
                : undefined
            }
            trend={
              data.yourRating !== null
                ? data.yourRating >= data.avgCompetitorRating
                  ? "up"
                  : "down"
                : undefined
            }
          />
          <ScoreCard
            label="Market Avg Rating"
            value={`${data.avgCompetitorRating}★`}
            sub={`${data.avgCompetitorReviews} avg reviews`}
            comparison={`${data.totalFound} competitors`}
          />
          <ScoreCard
            label="Your Avg Price"
            value={`$${data.pricing.yourAvgPrice}`}
            sub={
              data.pricing.marketAvgPrice
                ? `Market: ~$${data.pricing.marketAvgPrice}`
                : "Market price unknown"
            }
            comparison={
              data.pricing.percentDiff > 0
                ? `${data.pricing.percentDiff}% ${data.pricing.position} market`
                : "In line with market"
            }
            trend={
              data.pricing.position === "above"
                ? "up"
                : data.pricing.position === "below"
                  ? "down"
                  : undefined
            }
          />
          <ScoreCard
            label="Competitors"
            value={`${data.totalFound}`}
            sub={`Within ${data.radius}km`}
            comparison={
              data.totalFound > 10
                ? "High density"
                : data.totalFound < 3
                  ? "Low density"
                  : "Moderate"
            }
          />
        </div>
      )}

      {/* ── Two-column layout ───────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* ── Left: Insights + Competitors ─────────────────── */}
        <div className="space-y-8 lg:col-span-2">
          {/* Strategic Insights */}
          <section>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">
                Strategic Insights
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {data.insights.map((insight) => {
                const style = INSIGHT_STYLES[insight.type as InsightType] ?? INSIGHT_STYLES.info;
                const Icon = style.icon;
                return (
                  <div
                    key={insight.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                          style.bg
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">
                            {insight.title}
                          </h3>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                              style.bg
                            )}
                          >
                            {style.label}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {insight.description}
                        </p>
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-accent/5 border border-accent/10 px-3 py-2">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                          <p className="text-xs font-medium text-foreground">
                            {insight.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Competitor List */}
          {hasCompetitors && (
            <section>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">
                    Nearby Competitors
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sorted by distance
                </p>
              </div>

              <div className="mt-4 space-y-2">
                {data.competitors.map((comp) => {
                  const isExpanded = expandedCompetitor === comp.placeId;

                  return (
                    <div
                      key={comp.placeId}
                      className={cn(
                        "rounded-xl border transition-all",
                        isExpanded
                          ? "border-accent/30 bg-card shadow-sm"
                          : "border-border bg-card"
                      )}
                    >
                      <button
                        onClick={() =>
                          setExpandedCompetitor(
                            isExpanded ? null : comp.placeId
                          )
                        }
                        className="flex w-full items-center gap-4 p-4 text-left"
                      >
                        {/* Rating circle */}
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full border-2",
                            comp.rating >= 4.5
                              ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                              : comp.rating >= 4.0
                                ? "border-blue-500 bg-blue-500/10 text-blue-700"
                                : comp.rating >= 3.0
                                  ? "border-amber-500 bg-amber-500/10 text-amber-700"
                                  : "border-border bg-muted text-muted-foreground"
                          )}
                        >
                          <span className="text-sm font-bold leading-none">
                            {comp.rating > 0 ? comp.rating.toFixed(1) : "—"}
                          </span>
                          <Star className="h-2.5 w-2.5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-medium text-foreground">
                              {comp.name}
                            </h3>
                            {comp.isOpen !== null && (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  comp.isOpen
                                    ? "bg-emerald-500/10 text-emerald-600"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {comp.isOpen ? "Open" : "Closed"}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {comp.distance} km
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {comp.reviewCount} reviews
                            </span>
                            {comp.priceLevel !== null && (
                              <span className="flex items-center gap-0.5">
                                {Array.from({ length: comp.priceLevel }).map(
                                  (_, i) => (
                                    <DollarSign
                                      key={i}
                                      className="h-3 w-3 text-foreground"
                                    />
                                  )
                                )}
                                {Array.from({
                                  length: 4 - comp.priceLevel,
                                }).map((_, i) => (
                                  <DollarSign
                                    key={i}
                                    className="h-3 w-3 text-muted-foreground/30"
                                  />
                                ))}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rating comparison */}
                        {data.yourRating !== null && comp.rating > 0 && (
                          <div className="hidden text-right sm:block">
                            {data.yourRating > comp.rating ? (
                              <span className="text-xs font-medium text-emerald-600">
                                You&apos;re rated higher
                              </span>
                            ) : data.yourRating < comp.rating ? (
                              <span className="text-xs font-medium text-amber-600">
                                They&apos;re rated higher
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground">
                                Same rating
                              </span>
                            )}
                          </div>
                        )}

                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-border px-4 py-4">
                          {detailQuery.isLoading ? (
                            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading details…
                            </div>
                          ) : detailQuery.data ? (
                            <div className="space-y-4">
                              {/* Contact info */}
                              <div className="flex flex-wrap gap-3">
                                {detailQuery.data.phone && (
                                  <span className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
                                    <Phone className="h-3 w-3" />
                                    {detailQuery.data.phone}
                                  </span>
                                )}
                                {detailQuery.data.website && (
                                  <a
                                    href={detailQuery.data.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:text-accent"
                                  >
                                    <Globe className="h-3 w-3" />
                                    Website
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </div>

                              {/* Hours */}
                              {detailQuery.data.openingHours.length > 0 && (
                                <div>
                                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    Hours
                                  </p>
                                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                    {detailQuery.data.openingHours.map(
                                      (h, i) => (
                                        <p key={i}>{h}</p>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Reviews */}
                              {detailQuery.data.recentReviews.length > 0 && (
                                <div>
                                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <MessageSquare className="h-3 w-3" />
                                    Recent Reviews
                                  </p>
                                  <div className="space-y-2">
                                    {detailQuery.data.recentReviews.map(
                                      (review, i) => (
                                        <div
                                          key={i}
                                          className="rounded-lg bg-muted/50 px-3 py-2.5"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium text-foreground">
                                              {review.author}
                                            </span>
                                            <span className="flex items-center gap-0.5">
                                              {Array.from({
                                                length: review.rating,
                                              }).map((_, j) => (
                                                <Star
                                                  key={j}
                                                  className="h-2.5 w-2.5 fill-amber-400 text-amber-400"
                                                />
                                              ))}
                                            </span>
                                          </div>
                                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                            {review.text}
                                          </p>
                                          <p className="mt-1 text-[10px] text-muted-foreground/60">
                                            {review.time}
                                          </p>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="py-2 text-sm text-muted-foreground">
                              <p>
                                {comp.address && (
                                  <span className="flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {comp.address}
                                  </span>
                                )}
                              </p>
                              <p className="mt-2 text-xs">
                                Detailed info requires a Google Places API key.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* ── Right sidebar: Quick actions + setup ──────────── */}
        <div className="space-y-6 lg:col-span-1">
          {/* Pricing Position Card */}
          {hasCompetitors && data.pricing.marketAvgPrice && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <DollarSign className="h-4 w-4" />
                Pricing Position
              </h3>
              <div className="mt-4">
                <div className="relative h-4 rounded-full bg-muted">
                  {/* Market average indicator */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-muted-foreground"
                    style={{ left: "50%" }}
                  />
                  {/* Your position */}
                  <div
                    className={cn(
                      "absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-white shadow-md",
                      data.pricing.position === "above"
                        ? "bg-amber-500"
                        : data.pricing.position === "below"
                          ? "bg-emerald-500"
                          : "bg-blue-500"
                    )}
                    style={{
                      left: `${Math.min(Math.max(50 + (data.pricing.position === "above" ? data.pricing.percentDiff / 2 : data.pricing.position === "below" ? -data.pricing.percentDiff / 2 : 0), 10), 90)}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                </div>
                <div className="mt-3 flex justify-between text-[10px] font-medium text-muted-foreground">
                  <span>Lower</span>
                  <span>Market Avg</span>
                  <span>Higher</span>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your avg</span>
                    <span className="font-semibold text-foreground">
                      ${data.pricing.yourAvgPrice}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Market avg</span>
                    <span className="font-medium text-muted-foreground">
                      ~${data.pricing.marketAvgPrice}
                    </span>
                  </div>
                  {data.pricing.percentDiff > 0 && (
                    <p
                      className={cn(
                        "mt-1 rounded-lg px-3 py-2 text-xs font-medium",
                        data.pricing.position === "above"
                          ? "bg-amber-500/10 text-amber-700"
                          : data.pricing.position === "below"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-blue-500/10 text-blue-700"
                      )}
                    >
                      {data.pricing.position === "above"
                        ? `You're ${data.pricing.percentDiff}% above market. Make sure your experience justifies premium pricing.`
                        : data.pricing.position === "below"
                          ? `You're ${data.pricing.percentDiff}% below market. You may have room to increase prices.`
                          : "Your pricing is in line with the local market."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rating Leaderboard */}
          {hasCompetitors && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <Trophy className="h-4 w-4" />
                Rating Leaderboard
              </h3>
              <div className="mt-4 space-y-2">
                {[
                  ...(data.yourRating !== null
                    ? [
                        {
                          name: "You",
                          rating: data.yourRating,
                          reviews: data.yourReviewCount ?? 0,
                          isYou: true,
                        },
                      ]
                    : []),
                  ...data.competitors
                    .filter((c) => c.rating > 0)
                    .slice(0, 7)
                    .map((c) => ({
                      name: c.name,
                      rating: c.rating,
                      reviews: c.reviewCount,
                      isYou: false,
                    })),
                ]
                  .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
                  .slice(0, 8)
                  .map((entry, i) => (
                    <div
                      key={entry.name}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2",
                        entry.isYou
                          ? "bg-accent/10 border border-accent/20"
                          : ""
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                          i === 0
                            ? "bg-amber-500/20 text-amber-700"
                            : i === 1
                              ? "bg-gray-300/30 text-gray-600"
                              : i === 2
                                ? "bg-orange-400/20 text-orange-700"
                                : "bg-muted text-muted-foreground"
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm",
                            entry.isYou
                              ? "font-bold text-accent"
                              : "font-medium text-foreground"
                          )}
                        >
                          {entry.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-semibold text-foreground">
                          {entry.rating.toFixed(1)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({entry.reviews})
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Category Setup */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Search className="h-4 w-4" />
              Business Category
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              This determines which competitors we search for.
            </p>
            {showCategoryForm ? (
              <div className="mt-3 space-y-2">
                <input
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  placeholder="e.g. personal trainer, hair salon"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      updateCategory.mutate({
                        category: categoryInput.trim(),
                      })
                    }
                    disabled={
                      !categoryInput.trim() || updateCategory.isPending
                    }
                    className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
                  >
                    {updateCategory.isPending ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => setShowCategoryForm(false)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCategoryForm(true)}
                className="mt-3 w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
              >
                Change category
              </button>
            )}
          </div>

          {/* Quick tips */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lightbulb className="h-4 w-4 text-accent" />
              Quick Wins
            </h3>
            <ul className="mt-3 space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                Ask every client for a Google review after their session
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                Add photos to your Google listing weekly
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                Respond to every review (positive and negative)
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                Match competitors&apos; hours if they cover times you
                don&apos;t
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function ScoreCard({
  label,
  value,
  sub,
  comparison,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  comparison?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold",
              trend === "up"
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-red-500/10 text-red-600"
            )}
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      {comparison && (
        <p className="mt-1 text-[10px] font-medium text-muted-foreground/70">
          {comparison}
        </p>
      )}
    </div>
  );
}
