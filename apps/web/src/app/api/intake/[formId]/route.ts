import { NextResponse } from "next/server";
import { prisma } from "@bookai/db";

export async function GET(
  _request: Request,
  { params }: { params: { formId: string } }
) {
  try {
    const form = await prisma.intakeForm.findFirst({
      where: { id: params.formId, isActive: true },
    });

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    return NextResponse.json({
      name: form.name,
      description: form.description,
      fields: form.fields,
      requireSignature: form.requireSignature,
      organizationId: form.organizationId,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load form" },
      { status: 500 }
    );
  }
}
