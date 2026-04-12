"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, Loader2, AlertCircle, FileSignature } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface IntakeField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export default function IntakeFormPage() {
  const params = useParams();
  const token = params.token as string;

  // Token format: {intakeFormId}_{clientId}_{appointmentId?}
  const parts = token.split("_");
  const intakeFormId = parts[0];
  const clientId = parts[1];
  const appointmentId = parts[2] || undefined;

  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // We need the form details - fetch via a public-facing query
  // For now, we use the submit mutation which is public
  const submitMutation = trpc.intakeForm.submit.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err) => setError(err.message),
  });

  // Simple in-memory form structure fetcher
  // In production this would be a public endpoint
  const [formData, setFormData] = useState<{
    name: string;
    description?: string;
    fields: IntakeField[];
    requireSignature: boolean;
    organizationId: string;
  } | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Fetch form data on mount
  useState(() => {
    fetch(`/api/intake/${intakeFormId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Form not found");
        return r.json();
      })
      .then(setFormData)
      .catch(() => setLoadError(true));
  });

  function updateResponse(fieldId: string, value: unknown) {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  }

  // Signature canvas handlers
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    isDrawingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function stopDrawing() {
    isDrawingRef.current = false;
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL());
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData) return;

    // Validate required fields
    for (const field of formData.fields) {
      if (field.required && !responses[field.id]) {
        setError(`"${field.label}" is required.`);
        return;
      }
    }

    if (formData.requireSignature && !signatureData) {
      setError("Please provide your signature.");
      return;
    }

    setError(null);

    // Build labeled responses for readability
    const labeledResponses: Record<string, unknown> = {};
    for (const field of formData.fields) {
      if (responses[field.id] !== undefined) {
        labeledResponses[field.label] = responses[field.id];
      }
    }

    submitMutation.mutate({
      intakeFormId,
      clientId,
      organizationId: formData.organizationId,
      appointmentId,
      responses: labeledResponses,
      signatureData: signatureData ?? undefined,
    });
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
          <h1 className="text-2xl font-bold text-gray-900">Form Submitted</h1>
          <p className="mt-2 text-gray-600">
            Thank you! Your information has been received.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">Form Not Found</h1>
          <p className="mt-2 text-gray-600">
            This form link may have expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  if (!formData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-xl px-4">
        <div className="rounded-xl bg-white p-6 shadow-lg sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900">{formData.name}</h1>
          {formData.description && (
            <p className="mt-2 text-gray-600">{formData.description}</p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {formData.fields.map((field) => (
              <div key={field.id}>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </label>

                {field.type === "text" && (
                  <input
                    type="text"
                    value={(responses[field.id] as string) ?? ""}
                    onChange={(e) => updateResponse(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}

                {field.type === "textarea" && (
                  <textarea
                    value={(responses[field.id] as string) ?? ""}
                    onChange={(e) => updateResponse(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}

                {field.type === "email" && (
                  <input
                    type="email"
                    value={(responses[field.id] as string) ?? ""}
                    onChange={(e) => updateResponse(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}

                {field.type === "phone" && (
                  <input
                    type="tel"
                    value={(responses[field.id] as string) ?? ""}
                    onChange={(e) => updateResponse(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}

                {field.type === "number" && (
                  <input
                    type="number"
                    value={(responses[field.id] as string) ?? ""}
                    onChange={(e) => updateResponse(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}

                {field.type === "date" && (
                  <input
                    type="date"
                    value={(responses[field.id] as string) ?? ""}
                    onChange={(e) => updateResponse(field.id, e.target.value)}
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}

                {field.type === "select" && (
                  <select
                    value={(responses[field.id] as string) ?? ""}
                    onChange={(e) => updateResponse(field.id, e.target.value)}
                    required={field.required}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {field.type === "radio" && (
                  <div className="space-y-2">
                    {field.options?.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name={field.id}
                          value={opt}
                          checked={responses[field.id] === opt}
                          onChange={() => updateResponse(field.id, opt)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {field.type === "checkbox" && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!responses[field.id]}
                      onChange={(e) => updateResponse(field.id, e.target.checked)}
                    />
                    {field.placeholder || "Yes"}
                  </label>
                )}
              </div>
            ))}

            {/* Signature Pad */}
            {formData.requireSignature && (
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <FileSignature className="h-4 w-4" />
                  Signature <span className="text-red-500">*</span>
                </label>
                <div className="rounded-lg border border-gray-300 bg-white p-1">
                  <canvas
                    ref={canvasRef}
                    width={480}
                    height={150}
                    className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear signature
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Form
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
