"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Calendar,
  Clock,
  User,
  X,
  Loader2,
  AlertCircle,
  History,
  ClipboardList,
  Package,
  CheckCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "history" | "forms" | "packages";

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading, error: profileError } =
    trpc.portal.validateToken.useQuery({ token });

  const { data: appointments, isLoading: apptLoading } =
    trpc.portal.getAppointments.useQuery({ token }, { enabled: !!profile });

  const { data: history } =
    trpc.portal.getHistory.useQuery({ token }, { enabled: activeTab === "history" && !!profile });

  const { data: pendingForms } =
    trpc.portal.getPendingForms.useQuery({ token }, { enabled: activeTab === "forms" && !!profile });

  const { data: packages } =
    trpc.portal.getPackages.useQuery({ token }, { enabled: activeTab === "packages" && !!profile });

  const cancelMutation = trpc.portal.cancelAppointment.useMutation({
    onSuccess: () => {
      setCancellingId(null);
    },
  });

  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="text-2xl font-bold text-gray-900">Invalid Link</h1>
          <p className="mt-2 text-gray-600">
            This portal link may have expired or is invalid. Please contact the business for a new link.
          </p>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Calendar }> = [
    { id: "upcoming", label: "Upcoming", icon: Calendar },
    { id: "history", label: "History", icon: History },
    { id: "forms", label: "Forms", icon: ClipboardList },
    { id: "packages", label: "Packages", icon: Package },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{profile.business.name}</h1>
              <p className="text-sm text-gray-500">
                Welcome, {profile.firstName}
              </p>
            </div>
            {profile.business.logoUrl && (
              <img
                src={profile.business.logoUrl}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl gap-1 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* Upcoming Appointments */}
        {activeTab === "upcoming" && (
          <div className="space-y-3">
            {apptLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : !appointments?.length ? (
              <div className="rounded-xl bg-white p-8 text-center shadow-sm">
                <Calendar className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-900">No upcoming appointments</p>
                <p className="mt-1 text-sm text-gray-500">
                  You don&apos;t have any upcoming appointments scheduled.
                </p>
              </div>
            ) : (
              appointments.map((appt) => (
                <div
                  key={appt.id}
                  className="rounded-xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {appt.service.name}
                      </h3>
                      <div className="mt-1 space-y-0.5 text-sm text-gray-500">
                        <p className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(appt.startTime).toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(appt.startTime).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {" "}({appt.service.durationMinutes}min)
                        </p>
                        <p className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {appt.staffMember.displayName}
                        </p>
                      </div>
                    </div>
                    {cancellingId === appt.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            cancelMutation.mutate({
                              token,
                              appointmentId: appt.id,
                            })
                          }
                          disabled={cancelMutation.isPending}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                        >
                          {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
                        </button>
                        <button
                          onClick={() => setCancellingId(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setCancellingId(appt.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* History */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {!history?.length ? (
              <div className="rounded-xl bg-white p-8 text-center shadow-sm">
                <History className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-900">No appointment history</p>
              </div>
            ) : (
              history.map((appt) => (
                <div key={appt.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{appt.service.name}</h3>
                      <p className="text-sm text-gray-500">
                        {new Date(appt.startTime).toLocaleDateString()} with{" "}
                        {appt.staffMember.displayName}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        appt.status === "COMPLETED"
                          ? "bg-green-100 text-green-700"
                          : appt.status === "CANCELLED"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {appt.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Forms */}
        {activeTab === "forms" && (
          <div className="space-y-3">
            {!pendingForms?.length ? (
              <div className="rounded-xl bg-white p-8 text-center shadow-sm">
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-400" />
                <p className="font-medium text-gray-900">All forms completed</p>
                <p className="mt-1 text-sm text-gray-500">
                  You have no pending intake forms to fill out.
                </p>
              </div>
            ) : (
              pendingForms.map((item, idx) => (
                <a
                  key={idx}
                  href={`/intake/${item.intakeForm.id}_${profile.clientId}_${item.appointmentId}`}
                  className="block rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {item.intakeForm.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        For {item.serviceName} on{" "}
                        {new Date(item.appointmentDate).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      Pending
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
        )}

        {/* Packages */}
        {activeTab === "packages" && (
          <div className="space-y-3">
            {!packages?.length ? (
              <div className="rounded-xl bg-white p-8 text-center shadow-sm">
                <Package className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-900">No packages</p>
                <p className="mt-1 text-sm text-gray-500">
                  You don&apos;t have any active packages or memberships.
                </p>
              </div>
            ) : (
              packages.map((cp) => (
                <div key={cp.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{cp.package.name}</h3>
                      {cp.package.type === "VISIT_PACK" && cp.visitsTotal && (
                        <p className="text-sm text-gray-500">
                          {cp.visitsTotal - cp.visitsUsed} of {cp.visitsTotal} visits remaining
                        </p>
                      )}
                      {cp.expiryDate && (
                        <p className="text-xs text-gray-400">
                          Expires {new Date(cp.expiryDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        cp.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : cp.status === "PAUSED"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {cp.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
