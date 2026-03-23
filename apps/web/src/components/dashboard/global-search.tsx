"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Calendar, Users, Briefcase, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const { data: clients, isLoading: loadingClients } = trpc.client.list.useQuery(
    { search: query, limit: 5 },
    { enabled: query.length >= 2 }
  );

  const { data: appointments, isLoading: loadingAppts } = trpc.appointment.list.useQuery(
    { limit: 5 },
    { enabled: query.length >= 2 }
  );

  const isLoading = loadingClients || loadingAppts;

  function navigate(path: string) {
    setOpen(false);
    setQuery("");
    router.push(path);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, appointments..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button onClick={() => setOpen(false)}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {query.length >= 2 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {clients && clients.length > 0 && (
              <div className="mb-2">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">Clients</p>
                {clients.map((c: { id: string; firstName: string; lastName?: string | null; email?: string | null }) => (
                  <button
                    key={c.id}
                    onClick={() => navigate("/dashboard/clients")}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{c.firstName} {c.lastName ?? ""}</span>
                    {c.email && <span className="ml-auto text-xs text-muted-foreground">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-2">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">Quick Actions</p>
              <button onClick={() => navigate("/dashboard/calendar")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                <Calendar className="h-4 w-4 text-muted-foreground" /> View Calendar
              </button>
              <button onClick={() => navigate("/dashboard/appointments")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                <Briefcase className="h-4 w-4 text-muted-foreground" /> Manage Appointments
              </button>
            </div>

            {!clients?.length && !isLoading && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">No results found</p>
            )}
          </div>
        )}

        {query.length < 2 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </>
  );
}
