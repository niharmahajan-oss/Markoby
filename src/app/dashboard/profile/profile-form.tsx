"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { updateProfile } from "@/app/dashboard/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ fullName }: { fullName: string | null }) {
  const [value, setValue] = useState(fullName ?? "");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    const result = await updateProfile({ fullName: value });
    setSaving(false);
    if (result.ok) toast.success("Profile updated.");
    else toast.error(result.error);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="full_name">Display name</Label>
      <div className="flex gap-2">
        <Input
          id="full_name"
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Nihar Mahajan"
        />
        <Button onClick={onSave} disabled={saving || value.trim() === (fullName ?? "")}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Shown in the dashboard header. Your email address can&apos;t be changed
        here.
      </p>
    </div>
  );
}
