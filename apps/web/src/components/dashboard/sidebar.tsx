"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  Users,
  Scissors,
  UserCircle,
  MessageSquare,
  Inbox,
  BarChart3,
  Settings,
  Sparkles,
  Brain,
  Radar,
  Clock,
  Star,
  CalendarClock,
  Package,
  ClipboardList,
  Megaphone,
  Banknote,
} from "lucide-react";

const navigation = [
  { name: "AI Assistant", href: "/dashboard", icon: Sparkles },
  { name: "Revenue Coach", href: "/dashboard/insights", icon: Brain },
  { name: "Competitors", href: "/dashboard/competitive", icon: Radar },
  { name: "Bookable Hours", href: "/dashboard/availability", icon: CalendarClock },
  { name: "Bookings Calendar", href: "/dashboard/calendar", icon: Calendar },
  { name: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  { name: "Clients", href: "/dashboard/clients", icon: Users },
  { name: "Services", href: "/dashboard/services", icon: Scissors },
  { name: "Packages", href: "/dashboard/packages", icon: Package },
  { name: "Intake Forms", href: "/dashboard/forms", icon: ClipboardList },
  { name: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
  { name: "Payroll", href: "/dashboard/payroll", icon: Banknote },
  { name: "Staff", href: "/dashboard/staff", icon: UserCircle },
  { name: "Waitlist", href: "/dashboard/waitlist", icon: Clock },
  { name: "Reviews", href: "/dashboard/reviews", icon: Star },
  { name: "Request Centre", href: "/dashboard/request-centre", icon: Inbox },
  { name: "Messages", href: "/dashboard/messages", icon: MessageSquare },
  { name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: notificationCount } =
    trpc.ai.getNotificationCount.useQuery(undefined, {
      refetchInterval: 30_000,
    });
  const escalatedCount = notificationCount?.escalatedCount ?? 0;
  const pendingRequestCount = notificationCount?.pendingRequestCount ?? 0;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <Sparkles className="h-6 w-6 text-accent" />
        <span className="text-lg font-semibold text-sidebar-foreground">
          BookAI
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const isMessages = item.name === "Messages";
          const isRequestCentre = item.name === "Request Centre";
          const badgeCount = isRequestCentre
            ? pendingRequestCount
            : isMessages
              ? escalatedCount
              : 0;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
              {(isMessages || isRequestCentre) && badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
            B
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium text-sidebar-foreground">
              My Business
            </p>
            <p className="text-xs text-muted-foreground">Free Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
