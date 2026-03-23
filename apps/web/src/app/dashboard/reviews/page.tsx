"use client";

import { useState } from "react";
import { Star, MessageSquare, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const sizeClass = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            sizeClass,
            star <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "fill-transparent text-gray-300"
          )}
        />
      ))}
    </div>
  );
}

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export default function ReviewsPage() {
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const utils = trpc.useUtils();
  const { data: stats, isLoading: statsLoading } =
    trpc.review.getStats.useQuery();
  const { data: reviews, isLoading: reviewsLoading } =
    trpc.review.list.useQuery();

  const replyMutation = trpc.review.reply.useMutation({
    onSuccess: () => {
      utils.review.list.invalidate();
      setReplyingToId(null);
      setReplyText("");
    },
  });

  const reviewList = reviews ?? [];
  const isLoading = statsLoading || reviewsLoading;

  function handleReply(reviewId: string) {
    if (!replyText.trim()) return;
    replyMutation.mutate({ id: reviewId, reply: replyText.trim() });
  }

  return (
    <div className="p-8">
      <div>
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="mt-1 text-muted-foreground">
          See what clients are saying and respond to their feedback.
        </p>
      </div>

      {/* Stats Section */}
      {statsLoading ? (
        <div className="mt-6 flex items-center justify-center rounded-xl border border-border bg-card p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* Average Rating Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Average Rating
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {stats.averageRating?.toFixed(1) ?? "—"}
              </span>
              {stats.averageRating != null && (
                <StarRating rating={Math.round(stats.averageRating)} size="lg" />
              )}
            </div>
          </div>

          {/* Total Reviews Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Reviews
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {stats.totalReviews ?? 0}
              </span>
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          {/* Rating Distribution Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Distribution
            </p>
            <div className="mt-3 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count =
                  stats.distribution?.find(
                    (d: { rating: number; count: number }) => d.rating === star
                  )?.count ?? 0;
                const total = stats.totalReviews || 1;
                const pct = (count / total) * 100;

                return (
                  <div key={star} className="flex items-center gap-2">
                    <span className="w-3 text-right text-xs tabular-nums text-muted-foreground">
                      {star}
                    </span>
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-yellow-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Reviews List */}
      {isLoading ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading reviews…
          </p>
        </div>
      ) : reviewList.length === 0 ? (
        <div className="mt-8 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Star className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-foreground">No reviews yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Reviews from clients will appear here once they leave feedback.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {reviewList.map((review) => (
            <div
              key={review.id}
              className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {review.client?.firstName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {review.client?.firstName ?? "Anonymous"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {review.service?.name ?? "General"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StarRating rating={review.rating} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
              </div>

              {review.comment && (
                <p className="mt-3 text-sm leading-relaxed text-foreground">
                  {review.comment}
                </p>
              )}

              {/* Owner Reply */}
              {review.ownerReply && (
                <div className="mt-3 rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Your reply
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {review.ownerReply}
                  </p>
                </div>
              )}

              {/* Reply Action */}
              {!review.ownerReply && (
                <div className="mt-3 border-t border-border pt-3">
                  {replyingToId === review.id ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write a reply…"
                        className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-accent"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setReplyingToId(null);
                            setReplyText("");
                          }}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReply(review.id)}
                          disabled={
                            replyMutation.isPending || !replyText.trim()
                          }
                          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {replyMutation.isPending && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Send Reply
                        </button>
                      </div>
                      {replyMutation.isError && (
                        <p className="text-xs text-red-500">
                          {replyMutation.error.message}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setReplyingToId(review.id);
                        setReplyText("");
                      }}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Reply
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
