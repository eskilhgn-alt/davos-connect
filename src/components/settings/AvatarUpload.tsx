/**
 * AvatarUpload - Profile picture upload component
 * Uploads to avatars bucket, updates profile avatar_url
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DavosAvatar } from "@/components/ui/davos-avatar";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const AvatarUpload: React.FC = () => {
  const { user, profile, updateProfile } = useAuth();
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const initials = React.useMemo(() => {
    const name = profile?.full_name || profile?.nickname || profile?.email || "";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }, [profile]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Kun bilder er tillatt");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Maks 5 MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Add cache-busting param
      const url = `${data.publicUrl}?t=${Date.now()}`;

      const { error: profileError } = await updateProfile({ avatar_url: url });
      if (profileError) throw profileError;

      toast.success("Profilbilde oppdatert!");
    } catch (err: any) {
      console.error("Avatar upload error:", err);
      toast.error("Kunne ikke laste opp bilde");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="relative group"
      >
        <DavosAvatar
          src={profile?.avatar_url || undefined}
          fallback={initials}
          size="lg"
          className="w-20 h-20 text-lg"
        />
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
          {uploading ? (
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          ) : (
            <Camera className="h-5 w-5 text-white" />
          )}
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleUpload}
        className="hidden"
      />
      <p className="text-xs text-muted-foreground">Trykk for å endre bilde</p>
    </div>
  );
};
