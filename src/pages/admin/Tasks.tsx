import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ClipboardList, Loader2 } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string;
  event_id: string | null;
  items: unknown[];
  created_at: string;
}

interface Employee {
  user_id: string;
  username: string;
}

const AdminTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigned_to: "", items: "" });

  const fetchData = async () => {
    const [taskRes, empRes] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id").eq("role", "employee"),
    ]);
    if (taskRes.data) setTasks(taskRes.data as Task[]);

    if (empRes.data) {
      const userIds = empRes.data.map((r) => r.user_id);
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", userIds);
        setEmployees(profs ?? []);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const itemsArray = form.items.split("\n").filter(Boolean).map((i) => ({ name: i.trim(), quantity: 1 }));
    const { error } = await supabase.from("tasks").insert({
      title: form.title,
      description: form.description || null,
      assigned_to: form.assigned_to,
      assigned_by: user.id,
      items: itemsArray,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Task assign ho gayi!");
    setDialogOpen(false);
    setForm({ title: "", description: "", assigned_to: "", items: "" });
    fetchData();
  };

  const statusConfig: Record<string, { label: string; emoji: string; className: string }> = {
    completed: { label: "Mukammal", emoji: "✅", className: "bg-success/10 text-success" },
    in_progress: { label: "Chal raha", emoji: "🔄", className: "bg-warning/10 text-warning" },
    pending: { label: "Baaqi", emoji: "⏳", className: "bg-muted text-muted-foreground" },
  };

  const getEmployeeName = (id: string) => employees.find((e) => e.user_id === id)?.username ?? "Unknown";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold">✅ Tasks</h1>
          <p className="text-base text-muted-foreground mt-1">{tasks.length} tasks</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="rounded-xl text-sm sm:text-base font-semibold h-11 sm:h-12 px-4 sm:px-6 w-full sm:w-auto">
              <Plus className="h-5 w-5" /> Task Assign
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle className="text-xl">Nayi Task Assign Karein</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[15px] font-semibold">📌 Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[15px] font-semibold">📝 Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[15px] font-semibold">👤 Kisko Dein</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Employee chunein" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>{emp.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[15px] font-semibold">📦 Saaman (har line mein ek)</Label>
                <Textarea value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} placeholder="Balloons&#10;Lights&#10;Tables" rows={4} className="rounded-xl" />
              </div>
              <Button type="submit" className="w-full h-12 text-base font-semibold rounded-xl" disabled={!form.assigned_to}>
                Task Assign Karein
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
          <span className="text-5xl mb-4">✅</span>
          <p className="text-lg text-muted-foreground font-medium">Koi task assign nahi hui</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task) => {
            const status = statusConfig[task.status] ?? statusConfig.pending;
            return (
              <Card key={task.id} className="rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{task.title}</h3>
                    <Badge className={`${status.className} text-sm px-3 py-1`}>
                      {status.emoji} {status.label}
                    </Badge>
                  </div>
                  {task.description && <p className="text-[15px] text-muted-foreground">{task.description}</p>}
                  <p className="text-sm text-muted-foreground">
                    👤 <span className="font-semibold text-foreground">{getEmployeeName(task.assigned_to)}</span>
                  </p>
                  {Array.isArray(task.items) && task.items.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(task.items as Array<{ name: string }>).map((item, i) => (
                        <span key={i} className="inline-flex items-center rounded-xl bg-muted px-3 py-1.5 text-sm font-medium">
                          📦 {item.name}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminTasks;
