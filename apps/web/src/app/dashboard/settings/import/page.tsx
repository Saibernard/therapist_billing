"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  X,
  Download,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Step = "upload" | "mapping" | "importing" | "complete";

const CLIENT_FIELDS = [
  { value: "", label: "-- Skip column --" },
  { value: "firstName", label: "First Name *" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "preferredChannel", label: "Preferred Channel" },
  { value: "tags", label: "Tags (comma-separated)" },
  { value: "notes", label: "Notes" },
];

const SERVICE_FIELDS = [
  { value: "", label: "-- Skip column --" },
  { value: "name", label: "Service Name *" },
  { value: "description", label: "Description" },
  { value: "category", label: "Category" },
  { value: "durationMinutes", label: "Duration (minutes) *" },
  { value: "bufferMinutes", label: "Buffer (minutes)" },
  { value: "price", label: "Price *" },
];

function fuzzyMatch(header: string, fields: typeof CLIENT_FIELDS): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  const matches: Record<string, string[]> = {
    firstName: ["firstname", "first", "fname", "givenname"],
    lastName: ["lastname", "last", "lname", "surname", "familyname"],
    email: ["email", "emailaddress", "mail"],
    phone: ["phone", "phonenumber", "mobile", "cell", "telephone", "tel"],
    preferredChannel: ["channel", "preferredchannel", "contactmethod"],
    tags: ["tags", "labels", "categories", "groups"],
    notes: ["notes", "comments", "memo"],
    name: ["name", "servicename", "title"],
    description: ["description", "desc", "details"],
    category: ["category", "type", "group"],
    durationMinutes: ["duration", "durationminutes", "length", "minutes", "time"],
    bufferMinutes: ["buffer", "bufferminutes", "gap", "break"],
    price: ["price", "cost", "rate", "amount", "fee"],
  };

  for (const [field, patterns] of Object.entries(matches)) {
    if (patterns.some((p) => h.includes(p) || p.includes(h))) {
      if (fields.some((f) => f.value === field)) return field;
    }
  }
  return "";
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [importType, setImportType] = useState<"CLIENTS" | "SERVICES">("CLIENTS");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState({ processed: 0, errors: 0, total: 0 });
  const [importErrors, setImportErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createJob = trpc.import.createJob.useMutation();
  const startImport = trpc.import.startImport.useMutation();
  const processClientBatch = trpc.import.processClientBatch.useMutation();
  const processServiceBatch = trpc.import.processServiceBatch.useMutation();
  const completeJob = trpc.import.completeJob.useMutation();

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Upload failed");
        return;
      }

      const data = await res.json();
      setFileName(data.fileName);
      setHeaders(data.headers);
      setPreviewRows(data.previewRows);
      setAllRows(data.allRows);
      setProgress({ processed: 0, errors: 0, total: data.totalRows });

      const fields = importType === "CLIENTS" ? CLIENT_FIELDS : SERVICE_FIELDS;
      const autoMappings: Record<string, string> = {};
      for (const h of data.headers) {
        autoMappings[h] = fuzzyMatch(h, fields);
      }
      setMappings(autoMappings);
      setStep("mapping");
    } catch {
      alert("Failed to upload file");
    } finally {
      setUploading(false);
    }
  }, [importType]);

  const handleStartImport = useCallback(async () => {
    const activeMappings: Record<string, string> = {};
    for (const [col, field] of Object.entries(mappings)) {
      if (field) activeMappings[col] = field;
    }

    const requiredFields = importType === "CLIENTS" ? ["firstName"] : ["name", "durationMinutes", "price"];
    const mappedFields = Object.values(activeMappings);
    const missing = requiredFields.filter((f) => !mappedFields.includes(f));

    if (missing.length > 0) {
      alert(`Missing required mappings: ${missing.join(", ")}`);
      return;
    }

    setStep("importing");
    setImportErrors([]);

    try {
      const job = await createJob.mutateAsync({
        type: importType,
        fileName,
        totalRows: allRows.length,
        columnHeaders: headers,
      });
      setJobId(job.id);

      await startImport.mutateAsync({
        importJobId: job.id,
        mappings: activeMappings,
      });

      const BATCH_SIZE = 50;
      let totalProcessed = 0;
      let totalErrors = 0;
      const allImportErrors: Array<{ row: number; field: string; message: string }> = [];

      for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
        const batch = allRows.slice(i, i + BATCH_SIZE);
        const processFn = importType === "CLIENTS" ? processClientBatch : processServiceBatch;

        const result = await processFn.mutateAsync({
          importJobId: job.id,
          rows: batch,
        });

        totalProcessed += result.processed;
        totalErrors += result.errors;
        setProgress({ processed: totalProcessed, errors: totalErrors, total: allRows.length });
      }

      await completeJob.mutateAsync({ importJobId: job.id });
      setStep("complete");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed");
      setStep("mapping");
    }
  }, [mappings, importType, allRows, headers, fileName, createJob, startImport, processClientBatch, processServiceBatch, completeJob]);

  const fields = importType === "CLIENTS" ? CLIENT_FIELDS : SERVICE_FIELDS;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import clients and services from a CSV file. Supports exports from ChiroTouch, Mindbody, Vagaro, and more.
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "mapping", "importing", "complete"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-border" />}
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                step === s
                  ? "bg-accent text-accent-foreground"
                  : ["importing", "complete"].indexOf(step) >= ["upload", "mapping", "importing", "complete"].indexOf(s)
                    ? "bg-accent/20 text-accent"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {["importing", "complete"].indexOf(step) > ["upload", "mapping", "importing", "complete"].indexOf(s) ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                i + 1
              )}
            </div>
            <span className={cn("capitalize", step === s ? "font-medium text-foreground" : "text-muted-foreground")}>
              {s === "upload" ? "Upload" : s === "mapping" ? "Map Columns" : s === "importing" ? "Importing" : "Done"}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-6">
          <div className="flex gap-3">
            <button
              onClick={() => setImportType("CLIENTS")}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                importType === "CLIENTS"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              Import Clients
            </button>
            <button
              onClick={() => setImportType("SERVICES")}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                importType === "SERVICES"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              Import Services
            </button>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFileUpload(f);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-12 transition-colors hover:border-accent/50 hover:bg-muted/50"
          >
            {uploading ? (
              <Loader2 className="h-10 w-10 animate-spin text-accent" />
            ) : (
              <Upload className="h-10 w-10 text-muted-foreground" />
            )}
            <div className="text-center">
              <p className="font-medium text-foreground">
                {uploading ? "Parsing file..." : "Drop your CSV file here"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or click to browse (max 5MB)
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-medium text-foreground">Tips for importing</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>- First row must be column headers</li>
              <li>- Clients: at minimum, include First Name and either Email or Phone</li>
              <li>- Services: include Name, Duration (minutes), and Price</li>
              <li>- Duplicates are matched by email or phone and updated</li>
              <li>- Export from your current software as CSV first</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === "mapping" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <FileSpreadsheet className="h-5 w-5 text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">{fileName}</p>
              <p className="text-xs text-muted-foreground">{progress.total} rows found</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">Map CSV columns to fields</h3>
            <div className="space-y-2">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <span className="w-40 truncate text-sm font-medium text-foreground">{header}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={mappings[header] ?? ""}
                    onChange={(e) => setMappings((m) => ({ ...m, [header]: e.target.value }))}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    {fields.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {previewRows.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Preview (first {previewRows.length} rows)</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {headers.map((h) => (
                          <td key={h} className="px-3 py-2 text-foreground">{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("upload")}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={handleStartImport}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Start Import <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === "importing" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-12 w-12 animate-spin text-accent" />
            <p className="text-lg font-medium text-foreground">Importing data...</p>
            <p className="text-sm text-muted-foreground">
              {progress.processed} of {progress.total} rows processed
            </p>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
            />
          </div>

          {progress.errors > 0 && (
            <p className="text-sm text-destructive">
              <AlertCircle className="mr-1 inline h-4 w-4" />
              {progress.errors} rows had errors
            </p>
          )}
        </div>
      )}

      {/* Step 4: Complete */}
      {step === "complete" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-medium text-foreground">Import Complete</p>
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{progress.processed}</p>
                <p className="text-muted-foreground">Imported</p>
              </div>
              {progress.errors > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{progress.errors}</p>
                  <p className="text-muted-foreground">Errors</p>
                </div>
              )}
            </div>
          </div>

          {importErrors.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Errors</h3>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                {importErrors.map((err, i) => (
                  <p key={i} className="text-sm text-destructive">
                    Row {err.row}: {err.field} - {err.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setStep("upload");
                setHeaders([]);
                setPreviewRows([]);
                setAllRows([]);
                setMappings({});
                setProgress({ processed: 0, errors: 0, total: 0 });
                setImportErrors([]);
                setJobId(null);
              }}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Import More Data
            </button>
            <a
              href="/dashboard/clients"
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              View Clients
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
