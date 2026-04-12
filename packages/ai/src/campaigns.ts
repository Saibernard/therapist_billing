import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ClientContext {
  firstName: string;
  lastName?: string | null;
  lastVisitAt?: Date | null;
  totalVisits: number;
  totalSpent: number;
  tags?: unknown;
}

interface CampaignContext {
  businessName: string;
  campaignType: string;
  serviceName?: string;
  channel: string;
  template?: string | null;
}

/**
 * Generate a personalized campaign message using GPT-4o-mini.
 * Uses client history and context for personalization that static templates can't match.
 */
export async function generateCampaignMessage(
  client: ClientContext,
  campaign: CampaignContext
): Promise<string> {
  const channelGuidance =
    campaign.channel === "SMS"
      ? "Keep it under 160 characters. Be concise and direct."
      : campaign.channel === "WHATSAPP"
        ? "Keep it under 300 characters. Friendly and conversational."
        : "Write a short, friendly email body (2-3 sentences max). No subject line.";

  const typeGuidance: Record<string, string> = {
    BIRTHDAY: "This is a birthday message. Be warm and celebratory. Include a birthday offer if the template suggests one.",
    WINBACK: `This client hasn't visited in a while (last visit: ${client.lastVisitAt?.toLocaleDateString() ?? "unknown"}). Gently encourage them to come back.`,
    POST_VISIT: "Thank the client for their recent visit. Be appreciative.",
    REBOOK_NUDGE: "Remind the client it might be time to book their next appointment. Be helpful, not pushy.",
    CUSTOM: "Follow the template provided.",
  };

  const prompt = `Generate a personalized marketing message for a business called "${campaign.businessName}".

Client info:
- Name: ${client.firstName} ${client.lastName ?? ""}
- Total visits: ${client.totalVisits}
- Total spent: $${client.totalSpent}
${client.lastVisitAt ? `- Last visit: ${client.lastVisitAt.toLocaleDateString()}` : ""}

Campaign type: ${campaign.campaignType}
${typeGuidance[campaign.campaignType] ?? ""}

Channel: ${campaign.channel}
${channelGuidance}

${campaign.template ? `Template/guidance: ${campaign.template}` : ""}

Write ONLY the message text. No subject line, no greeting prefix like "Hi [name]" (the system adds the name). Be personable and on-brand. Do not use excessive exclamation marks.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a marketing copywriter for small businesses. Write short, personalized messages that feel human, not like mass marketing. Always address the client by first name.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 200,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
