import { prisma } from "@bookai/db";

// ── Types ──────────────────────────────────────────────────────────

export interface Competitor {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  priceLevel: number | null;
  distance: number;
  isOpen: boolean | null;
  types: string[];
  photoUrl: string | null;
}

export interface CompetitorDetail extends Competitor {
  phone: string | null;
  website: string | null;
  openingHours: string[];
  recentReviews: Array<{
    author: string;
    rating: number;
    text: string;
    time: string;
  }>;
}

export interface PricingComparison {
  yourAvgPrice: number;
  marketAvgPrice: number | null;
  position: "below" | "at" | "above";
  percentDiff: number;
}

export interface CompetitiveReport {
  competitors: Competitor[];
  totalFound: number;
  radius: number;
  yourRating: number | null;
  yourReviewCount: number | null;
  avgCompetitorRating: number;
  avgCompetitorReviews: number;
  pricing: PricingComparison;
  insights: CompetitiveInsight[];
  lastUpdated: string;
}

export interface CompetitiveInsight {
  id: string;
  type: "opportunity" | "threat" | "info";
  title: string;
  description: string;
  recommendation: string;
}

// ── Google Places Integration ──────────────────────────────────────

const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_PLACES_KEY) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_PLACES_KEY}`
    );
    const data = await res.json();
    if (data.results?.[0]?.geometry?.location) {
      return data.results[0].geometry.location;
    }
  } catch (err) {
    console.error("[COMPETITIVE] Geocode error:", err);
  }
  return null;
}

async function searchNearbyCompetitors(
  lat: number,
  lng: number,
  category: string,
  radiusMeters: number = 8000
): Promise<Competitor[]> {
  if (!GOOGLE_PLACES_KEY) return [];

  try {
    const keyword = encodeURIComponent(category);
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${keyword}&key=${GOOGLE_PLACES_KEY}`
    );
    const data = await res.json();

    if (!data.results) return [];

    return data.results.map(
      (place: {
        place_id: string;
        name: string;
        vicinity: string;
        rating?: number;
        user_ratings_total?: number;
        price_level?: number;
        opening_hours?: { open_now?: boolean };
        types?: string[];
        photos?: Array<{ photo_reference: string }>;
        geometry?: { location: { lat: number; lng: number } };
      }) => {
        const placeLat = place.geometry?.location?.lat ?? lat;
        const placeLng = place.geometry?.location?.lng ?? lng;
        const dist = haversineDistance(lat, lng, placeLat, placeLng);

        return {
          placeId: place.place_id,
          name: place.name,
          address: place.vicinity ?? "",
          rating: place.rating ?? 0,
          reviewCount: place.user_ratings_total ?? 0,
          priceLevel: place.price_level ?? null,
          distance: Math.round(dist * 10) / 10,
          isOpen: place.opening_hours?.open_now ?? null,
          types: place.types ?? [],
          photoUrl: place.photos?.[0]?.photo_reference
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=200&photo_reference=${place.photos[0].photo_reference}&key=${GOOGLE_PLACES_KEY}`
            : null,
        };
      }
    );
  } catch (err) {
    console.error("[COMPETITIVE] Nearby search error:", err);
    return [];
  }
}

async function getPlaceDetails(
  placeId: string
): Promise<CompetitorDetail | null> {
  if (!GOOGLE_PLACES_KEY) return null;

  try {
    const fields =
      "name,formatted_address,rating,user_ratings_total,price_level,formatted_phone_number,website,opening_hours,reviews,geometry,types,photos";
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_PLACES_KEY}`
    );
    const data = await res.json();
    const p = data.result;
    if (!p) return null;

    return {
      placeId,
      name: p.name ?? "",
      address: p.formatted_address ?? "",
      rating: p.rating ?? 0,
      reviewCount: p.user_ratings_total ?? 0,
      priceLevel: p.price_level ?? null,
      distance: 0,
      isOpen: p.opening_hours?.open_now ?? null,
      types: p.types ?? [],
      photoUrl: p.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photos[0].photo_reference}&key=${GOOGLE_PLACES_KEY}`
        : null,
      phone: p.formatted_phone_number ?? null,
      website: p.website ?? null,
      openingHours: p.opening_hours?.weekday_text ?? [],
      recentReviews: (p.reviews ?? [])
        .slice(0, 5)
        .map(
          (r: {
            author_name: string;
            rating: number;
            text: string;
            relative_time_description: string;
          }) => ({
            author: r.author_name,
            rating: r.rating,
            text: r.text,
            time: r.relative_time_description,
          })
        ),
    };
  } catch (err) {
    console.error("[COMPETITIVE] Place details error:", err);
    return null;
  }
}

// Search Google Places for the business itself to get its own rating
async function getOwnPlaceInfo(
  name: string,
  lat: number,
  lng: number
): Promise<{ rating: number; reviewCount: number } | null> {
  if (!GOOGLE_PLACES_KEY) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=200&keyword=${encodeURIComponent(name)}&key=${GOOGLE_PLACES_KEY}`
    );
    const data = await res.json();
    const match = data.results?.[0];
    if (match) {
      return {
        rating: match.rating ?? 0,
        reviewCount: match.user_ratings_total ?? 0,
      };
    }
  } catch {}
  return null;
}

// ── Haversine distance (km) ────────────────────────────────────────

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Price level to dollar amount mapping ───────────────────────────

function priceLevelToEstimate(level: number | null): number | null {
  if (level === null) return null;
  const mapping: Record<number, number> = {
    0: 15,
    1: 35,
    2: 65,
    3: 100,
    4: 150,
  };
  return mapping[level] ?? null;
}

// ── AI Analysis ────────────────────────────────────────────────────

async function generateAiInsights(
  org: { name: string; category: string | null },
  competitors: Competitor[],
  pricing: PricingComparison,
  ownRating: number | null,
  avgRating: number
): Promise<CompetitiveInsight[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return generateRuleBasedInsights(
      org,
      competitors,
      pricing,
      ownRating,
      avgRating
    );
  }

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });

    const competitorSummary = competitors
      .slice(0, 10)
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} — ${c.rating}★ (${c.reviewCount} reviews), ${c.distance}km away, price level: ${c.priceLevel ?? "unknown"}`
      )
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You are a competitive intelligence analyst for small service businesses. Analyze the competitive landscape and produce exactly 3-5 actionable insights. Each insight must be specific, data-backed, and include a clear recommendation.

Return ONLY valid JSON — an array of objects with these fields:
- id: short kebab-case identifier
- type: "opportunity" | "threat" | "info"
- title: concise headline (under 60 chars)
- description: 1-2 sentences of analysis with specific data
- recommendation: 1 sentence actionable recommendation`,
        },
        {
          role: "user",
          content: `Business: "${org.name}" (${org.category ?? "service business"})
Your rating: ${ownRating ?? "no Google listing"}
Your avg service price: $${pricing.yourAvgPrice}
Market position: ${pricing.position} market (${pricing.percentDiff}% ${pricing.position === "above" ? "higher" : pricing.position === "below" ? "lower" : "in line"})
Avg competitor rating: ${avgRating.toFixed(1)}

Nearby competitors:
${competitorSummary || "No competitors found in the area."}

Analyze this competitive landscape and provide insights.`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "[]";
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return generateRuleBasedInsights(
      org,
      competitors,
      pricing,
      ownRating,
      avgRating
    );
  } catch (err) {
    console.error("[COMPETITIVE] AI insights error:", err);
    return generateRuleBasedInsights(
      org,
      competitors,
      pricing,
      ownRating,
      avgRating
    );
  }
}

function generateRuleBasedInsights(
  org: { name: string; category: string | null },
  competitors: Competitor[],
  pricing: PricingComparison,
  ownRating: number | null,
  avgRating: number
): CompetitiveInsight[] {
  const insights: CompetitiveInsight[] = [];

  // Competitor density
  if (competitors.length > 10) {
    insights.push({
      id: "high-density",
      type: "info",
      title: `${competitors.length} competitors within 5 miles`,
      description: `The ${org.category ?? "service"} market in your area is crowded. Differentiation is critical — competing on price alone won't work in a market this dense.`,
      recommendation:
        "Focus on a specialty or niche that fewer than 3 competitors offer. Specialization beats generalization in saturated markets.",
    });
  } else if (competitors.length < 3) {
    insights.push({
      id: "low-density",
      type: "opportunity",
      title: "Low competition in your area",
      description: `Only ${competitors.length} similar businesses nearby. You have an opportunity to dominate the local market before it gets crowded.`,
      recommendation:
        "Invest in Google reviews and local SEO now to establish authority before new competitors enter.",
    });
  }

  // Rating comparison
  if (ownRating !== null) {
    if (ownRating >= avgRating + 0.3) {
      insights.push({
        id: "rating-advantage",
        type: "opportunity",
        title: `Your rating (${ownRating}★) beats the average (${avgRating.toFixed(1)}★)`,
        description:
          "Your higher rating is a competitive advantage that most small businesses don't leverage. Consumers filter by rating when choosing service providers.",
        recommendation:
          'Add your rating badge to your booking page and consider a "Highest Rated" positioning in your messaging.',
      });
    } else if (ownRating < avgRating - 0.2) {
      insights.push({
        id: "rating-gap",
        type: "threat",
        title: `Rating gap: you're at ${ownRating}★ vs ${avgRating.toFixed(1)}★ average`,
        description: `Your Google rating is below the local average. This likely costs you bookings — 88% of consumers trust online reviews as much as personal recommendations.`,
        recommendation:
          "Implement post-session review requests. Aim to get 10+ new 5-star reviews in the next 30 days.",
      });
    }
  } else {
    insights.push({
      id: "no-listing",
      type: "threat",
      title: "No Google Business listing detected",
      description:
        "You may not have a Google Business Profile, or it's not matching your business name. This means you're invisible in local search — where most clients discover service providers.",
      recommendation:
        "Claim or create your Google Business Profile immediately. It's free and is the #1 local discovery channel.",
    });
  }

  // Pricing position
  if (pricing.position === "below" && pricing.percentDiff > 15) {
    insights.push({
      id: "underpriced",
      type: "opportunity",
      title: `You're ${pricing.percentDiff}% below market pricing`,
      description: `Your average service price ($${pricing.yourAvgPrice}) is significantly below the local market. You may be leaving money on the table — especially if your ratings are competitive.`,
      recommendation: `Test a 10% price increase on your most popular service. If bookings don't drop, increase again.`,
    });
  } else if (pricing.position === "above" && pricing.percentDiff > 20) {
    insights.push({
      id: "premium-pricing",
      type: "info",
      title: `You're ${pricing.percentDiff}% above market pricing`,
      description: `Your pricing is premium for the area. This only works if your experience, reviews, and brand justify it.`,
      recommendation: `Ensure your Google reviews and booking page clearly communicate your premium value proposition.`,
    });
  }

  // Top competitor analysis
  const topCompetitor = competitors[0];
  if (topCompetitor && topCompetitor.reviewCount > 100) {
    insights.push({
      id: "top-competitor",
      type: "info",
      title: `${topCompetitor.name} dominates with ${topCompetitor.reviewCount} reviews`,
      description: `Your closest competitor has a significant review advantage. In local search, review count is a major ranking factor alongside rating.`,
      recommendation: `Target reaching ${Math.ceil(topCompetitor.reviewCount * 0.5)} reviews as your first milestone. Automate review requests after every completed appointment.`,
    });
  }

  return insights.slice(0, 5);
}

// ── Main Report Generator ──────────────────────────────────────────

export async function generateCompetitiveReport(
  organizationId: string,
  radiusKm: number = 8
): Promise<CompetitiveReport> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: {
      services: { where: { isActive: true } },
    },
  });

  // Resolve lat/lng
  let lat = org.latitude;
  let lng = org.longitude;

  if ((!lat || !lng) && org.address) {
    const coords = await geocodeAddress(org.address);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
      await prisma.organization.update({
        where: { id: organizationId },
        data: { latitude: lat, longitude: lng },
      });
    }
  }

  // Calculate own avg price
  const avgPrice =
    org.services.length > 0
      ? org.services.reduce((sum, s) => sum + Number(s.price), 0) /
        org.services.length
      : 0;

  // If no location or API key, return a report with guidance
  if (!lat || !lng || !GOOGLE_PLACES_KEY) {
    const insights = generateSetupInsights(org, !!GOOGLE_PLACES_KEY);
    return {
      competitors: [],
      totalFound: 0,
      radius: radiusKm,
      yourRating: null,
      yourReviewCount: null,
      avgCompetitorRating: 0,
      avgCompetitorReviews: 0,
      pricing: {
        yourAvgPrice: Math.round(avgPrice),
        marketAvgPrice: null,
        position: "at",
        percentDiff: 0,
      },
      insights,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Search for competitors
  const category = org.category ?? "personal trainer";
  const radiusMeters = radiusKm * 1000;
  const rawCompetitors = await searchNearbyCompetitors(
    lat,
    lng,
    category,
    radiusMeters
  );

  // Filter out the business itself
  const competitors = rawCompetitors
    .filter(
      (c) =>
        c.name.toLowerCase() !== org.name.toLowerCase() &&
        c.distance > 0.05
    )
    .sort((a, b) => a.distance - b.distance);

  // Get own Google rating
  const ownInfo = await getOwnPlaceInfo(org.name, lat, lng);

  // Calculate market stats
  const ratedCompetitors = competitors.filter((c) => c.rating > 0);
  const avgCompetitorRating =
    ratedCompetitors.length > 0
      ? ratedCompetitors.reduce((s, c) => s + c.rating, 0) /
        ratedCompetitors.length
      : 0;
  const avgCompetitorReviews =
    ratedCompetitors.length > 0
      ? Math.round(
          ratedCompetitors.reduce((s, c) => s + c.reviewCount, 0) /
            ratedCompetitors.length
        )
      : 0;

  // Estimate market pricing
  const pricedCompetitors = competitors.filter(
    (c) => c.priceLevel !== null
  );
  const marketAvgPrice =
    pricedCompetitors.length > 0
      ? Math.round(
          pricedCompetitors.reduce(
            (s, c) => s + (priceLevelToEstimate(c.priceLevel) ?? 0),
            0
          ) / pricedCompetitors.length
        )
      : null;

  let position: PricingComparison["position"] = "at";
  let percentDiff = 0;
  if (marketAvgPrice && avgPrice > 0) {
    percentDiff = Math.round(
      Math.abs((avgPrice - marketAvgPrice) / marketAvgPrice) * 100
    );
    if (avgPrice > marketAvgPrice * 1.1) position = "above";
    else if (avgPrice < marketAvgPrice * 0.9) position = "below";
  }

  const pricing: PricingComparison = {
    yourAvgPrice: Math.round(avgPrice),
    marketAvgPrice,
    position,
    percentDiff,
  };

  // Generate insights
  const insights = await generateAiInsights(
    { name: org.name, category: org.category },
    competitors,
    pricing,
    ownInfo?.rating ?? null,
    avgCompetitorRating
  );

  return {
    competitors: competitors.slice(0, 20),
    totalFound: competitors.length,
    radius: radiusKm,
    yourRating: ownInfo?.rating ?? null,
    yourReviewCount: ownInfo?.reviewCount ?? null,
    avgCompetitorRating: Math.round(avgCompetitorRating * 10) / 10,
    avgCompetitorReviews,
    pricing,
    insights,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getCompetitorDetails(
  placeId: string
): Promise<CompetitorDetail | null> {
  return getPlaceDetails(placeId);
}

// ── Setup guidance (when missing config) ───────────────────────────

function generateSetupInsights(
  org: { address: string | null; category: string | null },
  hasApiKey: boolean
): CompetitiveInsight[] {
  const insights: CompetitiveInsight[] = [];

  if (!hasApiKey) {
    insights.push({
      id: "setup-api-key",
      type: "info",
      title: "Connect Google Places for live data",
      description:
        "Add your Google Places API key to unlock real-time competitor monitoring. You'll see every competitor within 5 miles, their ratings, reviews, and pricing.",
      recommendation:
        "Add GOOGLE_PLACES_API_KEY to your environment variables. The API has a generous free tier (up to $200/month credit).",
    });
  }

  if (!org.address) {
    insights.push({
      id: "setup-address",
      type: "info",
      title: "Add your business address",
      description:
        "A business address is needed to find nearby competitors. Go to Settings and add your location.",
      recommendation:
        "Navigate to Settings → Business Info and add your full address.",
    });
  }

  if (!org.category) {
    insights.push({
      id: "setup-category",
      type: "info",
      title: "Set your business category",
      description:
        'Tell us what kind of business you run (e.g. "personal trainer", "hair salon", "yoga studio") so we can find the right competitors.',
      recommendation:
        "Navigate to Settings → Business Info and set your business category.",
    });
  }

  // Always include general competitive advice
  insights.push({
    id: "general-reviews",
    type: "opportunity",
    title: "Google reviews are your #1 growth lever",
    description:
      "97% of consumers read online reviews before choosing a local business. The business with the most high-quality reviews wins the lion's share of new clients.",
    recommendation:
      "Start asking every client for a Google review after their appointment. Even 10 reviews makes a huge difference for a new business.",
  });

  insights.push({
    id: "general-local-seo",
    type: "opportunity",
    title: "Claim your Google Business Profile",
    description:
      'A complete Google Business Profile with photos, hours, and services is free advertising. It appears in "near me" searches, Google Maps, and local packs.',
    recommendation:
      "Visit business.google.com to claim or create your listing. Add photos, service list, and business hours.",
  });

  return insights;
}
