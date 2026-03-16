import { Outlet } from "react-router-dom";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import AdminSidebar from "@/components/AdminSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { PartyPopper } from "lucide-react";

const AdminLayout = () => {
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();

  return (
    <div className="flex h-screen-safe overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AdminSidebar />
      </div>

      {/* Mobile header + drawer */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden safe-top shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <PartyPopper className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold">The Adorners</h1>
              <p className="text-[11px] text-muted-foreground">{profile?.username ?? "Admin"}</p>
            </div>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <AdminSidebar onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 overflow-y-auto bg-background min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
