import { Sidebar } from "@/components/dashboard/sidebar";
import { AiChatPanel } from "@/components/dashboard/ai-chat-panel";
import { GlobalSearch } from "@/components/dashboard/global-search";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <GlobalSearch />
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">{children}</div>

          <div className="hidden w-96 border-l border-border lg:block">
            <AiChatPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
