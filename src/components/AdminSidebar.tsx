import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays, Package, FileText, BookOpen, MessageCircle,
  ClipboardList, LogOut, PartyPopper, Users, Bell, Sparkles, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Events", icon: CalendarDays, path: "/admin/events", emoji: "📅" },
  { label: "Inventory", icon: Package, path: "/admin/inventory", emoji: "📦" },
  { label: "Invoice", icon: FileText, path: "/admin/invoice", emoji: "🧾" },
  { label: "Ledger", icon: BookOpen, path: "/admin/ledger", emoji: "📒" },
  { label: "Staff Ledger", icon: Wallet, path: "/admin/staff-ledger", emoji: "📓" },
  { label: "Chat", icon: MessageCircle, path: "/admin/chat", emoji: "💬" },
  { label: "Tasks", icon: ClipboardList, path: "/admin/tasks", emoji: "✅" },
  { label: "Team", icon: Users, path: "/admin/employees", emoji: "👥" },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
}

const AdminSidebar = ({ onNavigate }: AdminSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const [pendingAiCount, setPendingAiCount] = useState(0);
  const [pendingStaffCount, setPendingStaffCount] = useState(0);
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);

  useEffect(() => {
    const fetchPending = async () => {
      const [evtRes, staffRes, payRes] = await Promise.all([
        supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "pending_ai"),
        supabase.from("staff_ledger").select("*", { count: "exact", head: true }).eq("status", "pending_ai"),
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("status", "pending_ai"),
      ]);
      setPendingAiCount(evtRes.count ?? 0);
      setPendingStaffCount(staffRes.count ?? 0);
      setPendingPaymentCount(payRes.count ?? 0);
    };
    fetchPending();

    const channel = supabase
      .channel("ai-events-sidebar")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => fetchPending())
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_ledger" }, () => fetchPending())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => fetchPending())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleNav = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <div className="flex h-screen w-72 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sidebar-primary/20">
          <PartyPopper className="h-6 w-6 text-sidebar-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-sidebar-primary">The Adorners</h1>
          <p className="text-xs text-sidebar-foreground/50 font-medium">Admin Panel</p>
        </div>
      </div>

      {/* AI Alert */}
      {pendingAiCount > 0 && (
        <button
          onClick={() => handleNav("/admin/events")}
          className="mx-4 mt-4 flex items-center gap-3 rounded-xl bg-sidebar-primary/15 px-4 py-3 transition-colors hover:bg-sidebar-primary/25"
        >
          <div className="relative">
            <Bell className="h-5 w-5 text-sidebar-primary" />
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-sidebar-primary text-[10px] font-bold text-sidebar-primary-foreground">
              {pendingAiCount}
            </span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-sidebar-primary">{pendingAiCount} AI Event{pendingAiCount > 1 ? "s" : ""}</p>
            <p className="text-xs text-sidebar-foreground/50">Review karein</p>
          </div>
          <Sparkles className="h-4 w-4 text-sidebar-primary/60" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-4 py-5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const showBadge = item.path === "/admin/events" && pendingAiCount > 0;
          const showStaffBadge = item.path === "/admin/staff-ledger" && pendingStaffCount > 0;
          const showPayBadge = item.path === "/admin/ledger" && pendingPaymentCount > 0;
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-semibold transition-all duration-200",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <span className="text-lg">{item.emoji}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {showBadge && (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-sidebar-primary-foreground/20 px-1.5 text-[11px] font-bold">
                  {pendingAiCount}
                </span>
              )}
              {showStaffBadge && (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-500/20 text-amber-300 px-1.5 text-[11px] font-bold">
                  {pendingStaffCount}
                </span>
              )}
              {showPayBadge && (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-green-500/20 text-green-300 px-1.5 text-[11px] font-bold">
                  {pendingPaymentCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Info */}
      <div className="border-t border-sidebar-border px-5 py-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-sidebar-foreground">
              {profile?.username ?? "Admin"}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/40">
              {profile?.email}
            </p>
          </div>
          <button
            onClick={signOut}
            className="rounded-xl p-2.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSidebar;
