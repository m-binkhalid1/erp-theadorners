import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import AdminLayout from "./layouts/AdminLayout";
import EmployeeLayout from "./layouts/EmployeeLayout";
import AdminEvents from "./pages/admin/Events";
import AdminInventory from "./pages/admin/Inventory";
import AdminInvoice from "./pages/admin/Invoice";
import AdminLedger from "./pages/admin/Ledger";
import AdminChat from "./pages/admin/Chat";
import AdminTasks from "./pages/admin/Tasks";
import AdminEmployees from "./pages/admin/Employees";
import EmployeeChat from "./pages/employee/Chat";
import EmployeeTasks from "./pages/employee/Tasks";
import EmployeeEvents from "./pages/employee/Events";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode; allowedRole: "admin" | "employee" }) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role !== allowedRole) {
    return <Navigate to={role === "admin" ? "/admin/events" : role === "employee" ? "/employee/chat" : "/login"} replace />;
  }

  return <>{children}</>;
};

const HomeRedirect = () => {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/admin/events" replace />;
  if (role === "employee") return <Navigate to="/employee/chat" replace />;
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-lg font-medium">No role assigned</p>
        <p className="text-sm text-muted-foreground">Contact admin to get your role assigned.</p>
      </div>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<HomeRedirect />} />

            <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/admin/events" replace />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="inventory" element={<AdminInventory />} />
              <Route path="invoice" element={<AdminInvoice />} />
              <Route path="ledger" element={<AdminLedger />} />
              <Route path="chat" element={<AdminChat />} />
              <Route path="tasks" element={<AdminTasks />} />
              <Route path="employees" element={<AdminEmployees />} />
            </Route>

            <Route path="/employee" element={<ProtectedRoute allowedRole="employee"><EmployeeLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/employee/chat" replace />} />
              <Route path="chat" element={<EmployeeChat />} />
              <Route path="tasks" element={<EmployeeTasks />} />
              <Route path="events" element={<EmployeeEvents />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
