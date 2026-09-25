import { NextResponse } from "next/server";
import { CAMPAIGN_TEMPLATES } from "@/lib/templates/campaign-templates";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    success: true,
    data: CAMPAIGN_TEMPLATES.map(
      ({
        slug,
        title,
        category,
        audience,
        summary,
        goal,
        keywords,
        dmMessage,
      }) => ({
        slug,
        title,
        category,
        audience,
        summary,
        goal,
        keywords,
        dmMessage,
      })
    ),
  });
}
