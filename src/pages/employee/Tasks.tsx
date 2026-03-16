import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  items: Array<{ name: string; quantity: number }>;
  items_taken: Array<{ name: string; quantity: number }>;
  items_returned: Array<{ name: string; quantity: number }>;
  created_at: string;
}

const EmployeeTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("assigned_to", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setTasks((data ?? []) as unknown as Task[]);
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, [user]);

  const toggleItemTaken = async (task: Task, itemName: string) => {
    const taken = [...(task.items_taken || [])];
    const idx = taken.findIndex((i) => i.name === itemName);
    if (idx >= 0) taken.splice(idx, 1);
    else taken.push({ name: itemName, quantity: 1 });

    const { error } = await supabase.from("tasks").update({ items_taken: taken }).eq("id", task.id);
    if (error) toast.error(error.message);
    else fetchTasks();
  };

  const toggleItemReturned = async (task: Task, itemName: string) => {
    const returned = [...(task.items_returned || [])];
    const idx = returned.findIndex((i) => i.name === itemName);
    if (idx >= 0) returned.splice(idx, 1);
    else returned.push({ name: itemName, quantity: 1 });

    const { error } = await supabase.from("tasks").update({ items_returned: returned }).eq("id", task.id);
    if (error) toast.error(error.message);
    else fetchTasks();
  };

  const markComplete = async (taskId: string) => {
    const { error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", taskId);
    if (error) toast.error(error.message);
    else { toast.success("Task mukammal ho gayi! ✅"); fetchTasks(); }
  };

  const statusConfig: Record<string, { label: string; emoji: string; className: string }> = {
    completed: { label: "Mukammal", emoji: "✅", className: "bg-success/10 text-success" },
    in_progress: { label: "Chal raha", emoji: "🔄", className: "bg-warning/10 text-warning" },
    pending: { label: "Baaqi", emoji: "⏳", className: "bg-muted text-muted-foreground" },
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <h1 className="text-2xl font-display font-bold">✅ Meri Tasks</h1>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
          <span className="text-5xl mb-3">✅</span>
          <p className="text-lg text-muted-foreground font-medium">Koi task nahi hai abhi</p>
        </div>
      ) : (
        tasks.map((task) => {
          const items = Array.isArray(task.items) ? task.items : [];
          const taken = Array.isArray(task.items_taken) ? task.items_taken : [];
          const returned = Array.isArray(task.items_returned) ? task.items_returned : [];
          const status = statusConfig[task.status] ?? statusConfig.pending;
          return (
            <Card key={task.id} className="rounded-2xl overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{task.title}</CardTitle>
                  <Badge className={`${status.className} text-sm px-3 py-1`}>
                    {status.emoji} {status.label}
                  </Badge>
                </div>
                {task.description && <p className="text-[15px] text-muted-foreground mt-1">{task.description}</p>}
              </CardHeader>
              {items.length > 0 && (
                <CardContent className="space-y-5">
                  {/* Items to Take */}
                  <div>
                    <p className="text-sm font-bold text-muted-foreground mb-3">📦 Saaman Le Jao</p>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const isTaken = taken.some((t) => t.name === item.name);
                        return (
                          <button
                            key={item.name}
                            onClick={() => toggleItemTaken(task, item.name)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all text-left",
                              isTaken ? "bg-success/10" : "bg-muted/50 hover:bg-muted"
                            )}
                          >
                            <Checkbox checked={isTaken} className="h-5 w-5" />
                            <span className={`text-[15px] font-medium ${isTaken ? "line-through text-muted-foreground" : ""}`}>
                              {item.name}
                            </span>
                            {isTaken && <span className="ml-auto text-success text-sm">✅</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Items Returned */}
                  <div>
                    <p className="text-sm font-bold text-muted-foreground mb-3">🔙 Wapas Karo</p>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const isReturned = returned.some((t) => t.name === item.name);
                        return (
                          <button
                            key={item.name}
                            onClick={() => toggleItemReturned(task, item.name)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all text-left",
                              isReturned ? "bg-success/10" : "bg-muted/50 hover:bg-muted"
                            )}
                          >
                            <Checkbox checked={isReturned} className="h-5 w-5" />
                            <span className={`text-[15px] font-medium ${isReturned ? "line-through text-muted-foreground" : ""}`}>
                              {item.name}
                            </span>
                            {isReturned && <span className="ml-auto text-success text-sm">✅</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {task.status !== "completed" && (
                    <Button onClick={() => markComplete(task.id)} className="w-full h-12 text-base font-semibold rounded-xl" variant="outline">
                      <CheckCircle2 className="h-5 w-5" /> Task Mukammal ✅
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
};


export default EmployeeTasks;
