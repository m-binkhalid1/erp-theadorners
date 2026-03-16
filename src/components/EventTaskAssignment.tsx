import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Package, Plus, Minus } from "lucide-react";

interface Employee {
  user_id: string;
  username: string;
}

interface InventoryItem {
  id: string;
  name: string;
  specification: string;
  available_quantity: number;
  category_id: string;
}

interface Category {
  id: string;
  name: string;
}

interface SelectedItem {
  inventory_id: string;
  name: string;
  quantity: number;
  available: number;
}

interface EventTaskAssignmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventCompany: string;
  eventDate: string;
  eventPlace: string;
}

const EventTaskAssignment = ({ open, onOpenChange, eventId, eventCompany, eventDate, eventPlace }: EventTaskAssignmentProps) => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      setTaskTitle(`${eventCompany} - ${eventPlace}`);
      setTaskDescription(`Event on ${eventDate} at ${eventPlace}`);
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setLoading(true);
    const [empRes, invRes, catRes] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "employee"),
      supabase.from("inventory").select("id, name, specification, available_quantity, category_id").gt("available_quantity", 0).order("name"),
      supabase.from("inventory_categories").select("id, name").order("name"),
    ]);

    if (empRes.data) {
      const userIds = empRes.data.map((r) => r.user_id);
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", userIds);
        setEmployees(profs ?? []);
      }
    }
    setInventory((invRes.data ?? []) as InventoryItem[]);
    setCategories((catRes.data ?? []) as Category[]);
    setLoading(false);
  };

  const toggleItem = (item: InventoryItem) => {
    setSelectedItems(prev => {
      const exists = prev.find(s => s.inventory_id === item.id);
      if (exists) return prev.filter(s => s.inventory_id !== item.id);
      return [...prev, { inventory_id: item.id, name: item.name, quantity: 1, available: item.available_quantity }];
    });
  };

  const updateItemQty = (inventoryId: string, delta: number) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.inventory_id !== inventoryId) return item;
      const newQty = Math.max(1, Math.min(item.available, item.quantity + delta));
      return { ...item, quantity: newQty };
    }));
  };

  const filteredInventory = inventory.filter(item => {
    const matchCategory = filterCategory === "all" || item.category_id === filterCategory;
    const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name ?? "";

  const handleSubmit = async () => {
    if (!user || !selectedEmployee) return;
    setSubmitting(true);

    const itemsPayload = selectedItems.map(i => ({ name: i.name, quantity: i.quantity }));

    // 1. Create the task
    const { error } = await supabase.from("tasks").insert({
      title: taskTitle,
      description: taskDescription || null,
      assigned_to: selectedEmployee,
      assigned_by: user.id,
      event_id: eventId,
      items: itemsPayload,
    });

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    // 2. Deduct available_quantity and create inventory transactions
    const transactionPromises = selectedItems.map(async (item) => {
      // Deduct available quantity
      const invItem = inventory.find(i => i.id === item.inventory_id);
      if (!invItem) return;
      const newAvail = Math.max(0, invItem.available_quantity - item.quantity);

      await supabase.from("inventory").update({ available_quantity: newAvail }).eq("id", item.inventory_id);

      // Create transaction record
      await supabase.from("inventory_transactions").insert({
        inventory_item_id: item.inventory_id,
        event_id: eventId,
        transaction_type: "sent_to_event" as const,
        quantity: item.quantity,
        notes: `Assigned to ${taskTitle}`,
        created_by: user.id,
      });
    });

    await Promise.all(transactionPromises);

    toast.success("Task assigned & inventory deducted!");
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setSelectedEmployee("");
    setTaskTitle("");
    setTaskDescription("");
    setSelectedItems([]);
    setFilterCategory("all");
    setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Assign Task — {eventCompany}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            {/* Task details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Task Title</Label>
                <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>{emp.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} rows={2} />
            </div>

            {/* Inventory packing list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Packing List</Label>
                {selectedItems.length > 0 && (
                  <Badge variant="secondary">{selectedItems.length} items selected</Badge>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-lg max-h-[250px] overflow-y-auto divide-y divide-border">
                {filteredInventory.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No items found</p>
                ) : (
                  filteredInventory.map(item => {
                    const selected = selectedItems.find(s => s.inventory_id === item.id);
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors">
                        <Checkbox
                          checked={!!selected}
                          onCheckedChange={() => toggleItem(item)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {getCategoryName(item.category_id)} · {item.specification && `${item.specification} · `}Avail: {item.available_quantity}
                          </p>
                        </div>
                        {selected && (
                          <div className="flex items-center gap-1.5">
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItemQty(item.id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{selected.quantity}</span>
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItemQty(item.id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Selected items summary */}
            {selectedItems.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Packing Summary</p>
                <div className="flex flex-wrap gap-2">
                  {selectedItems.map(item => (
                    <Badge key={item.inventory_id} variant="outline" className="text-xs">
                      {item.name} × {item.quantity}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleSubmit} disabled={!selectedEmployee || !taskTitle || submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign Task with Packing List
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EventTaskAssignment;
