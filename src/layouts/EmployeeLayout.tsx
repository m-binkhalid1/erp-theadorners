import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, ClipboardList, CalendarDays, LogOut, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Chat", icon: MessageCircle, path: "/employee/chat", emoji: "💬" },
  { label: "Tasks", icon: ClipboardList, path: "/employee/tasks", emoji: "✅" },
  { label: "Events", icon: CalendarDays, path: "/employee/events", emoji: "📅" },
];

const EmployeeLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();

  return (
    <div className="flex h-screen-safe flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 safe-top shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <PartyPopper className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">The Adorners</h1>
            <p className="text-xs text-muted-foreground">{profile?.username}</p>
          </div>
        </div>
        <button onClick={signOut} className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground hover:bg-muted transition-colors">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto bg-background min-h-0">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="flex border-t-2 border-border bg-card safe-bottom shrink-0">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-sm font-semibold transition-all",
                isActive 
                  ? "text-primary bg-accent" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="text-xl">{item.emoji}</span>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default EmployeeLayout;
