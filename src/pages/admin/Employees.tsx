import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, Loader2, ShieldCheck, UserPlus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Profile {
  user_id: string;
  username: string;
  email: string;
  roles: string[];
}

const AdminEmployees = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<{ userId: string; role: string }>({ userId: "", role: "employee" });

  const fetchUsers = async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, email");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    const roleMap: Record<string, string[]> = {};
    roles?.forEach((r) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    setUsers(
      (profiles ?? []).map((p) => ({ ...p, roles: roleMap[p.user_id] ?? [] }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const assignRole = async () => {
    if (!newRole.userId || !newRole.role) return;
    const { error } = await supabase.from("user_roles").insert({
      user_id: newRole.userId,
      role: newRole.role as "admin" | "employee",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Role assign ho gaya!");
    setDialogOpen(false);
    fetchUsers();
  };

  const removeRole = async (userId: string, role: string) => {
    if (!confirm(`Kya aap waqai is user se '${role}' role wapis lena chahte hain?`)) return;
    const { error } = await supabase.from("user_roles").delete().match({ user_id: userId, role });
    if (error) { toast.error(error.message); return; }
    toast.success("Role wapis le liya gaya!");
    fetchUsers();
  };

  const deleteUser = async (userId: string, username: string) => {
    if (!confirm(`⚠️ WARNING: Kya aap '${username}' ko team se mukammal khatam karna chahte hain? Ye action reverse nahi ho sakta.`)) return;
    
    // First remove roles to handle potential foreign key constraints
    await supabase.from("user_roles").delete().eq("user_id", userId);
    
    // Then delete profile
    const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
    if (error) { 
      // If profile deletion fails (e.g. strict RLS or auth FK trigger issues), at least roles are gone
      toast.error(`Profile delete error: ${error.message}. Roles removed though.`); 
      fetchUsers();
      return; 
    }
    toast.success("Team member mukammal delete ho gaya!");
    fetchUsers();
  };


  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold">👥 Team</h1>
          <p className="text-base text-muted-foreground mt-1">{users.length} members</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="rounded-xl text-sm sm:text-base font-semibold h-11 sm:h-12 px-4 sm:px-6 w-full sm:w-auto">
              <UserPlus className="h-5 w-5" /> Role Dein
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle className="text-xl">Role Assign Karein</DialogTitle></DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[15px] font-semibold">👤 User</Label>
                <Select value={newRole.userId} onValueChange={(v) => setNewRole({ ...newRole, userId: v })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="User chunein" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.username} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[15px] font-semibold">🔑 Role</Label>
                <Select value={newRole.role} onValueChange={(v) => setNewRole({ ...newRole, role: v })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">🛡️ Admin</SelectItem>
                    <SelectItem value="employee">👷 Employee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={assignRole} className="w-full h-12 text-base font-semibold rounded-xl" disabled={!newRole.userId}>
                Role Assign Karein
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4">
          {users.map((u) => (
            <Card key={u.user_id} className="rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-lg font-bold">{u.username}</p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
                  <div className="flex flex-wrap gap-2 justify-end">
                    {u.roles.length === 0 && <Badge variant="outline" className="text-sm px-3 py-1">❌ No role</Badge>}
                    {u.roles.map((r) => (
                      <Badge key={r} className={`text-sm px-3 py-1 flex items-center gap-1 ${r === "admin" ? "bg-gold/20 text-foreground" : "bg-accent text-accent-foreground"}`}>
                        {r === "admin" ? "🛡️" : "👷"} {r}
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeRole(u.user_id, r); }}
                          className="ml-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
                          title="Revoke Role"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 text-destructive hover:bg-destructive/10"
                    onClick={() => deleteUser(u.user_id, u.username)}
                    title="Remove Member"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminEmployees;
