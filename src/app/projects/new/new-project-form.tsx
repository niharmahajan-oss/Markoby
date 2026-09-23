"use client";

import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createProject } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProjectForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [fetchingSite, setFetchingSite] = useState(false);

  async function onSubmit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      toast.error("Give your project a name first.");
      return;
    }
    setPending(true);
    if (websiteUrl.trim()) setFetchingSite(true);

    const result = await createProject({
      name,
      websiteUrl: websiteUrl.trim() || undefined,
    });

    if (!result.ok) {
      toast.error(result.error);
      setPending(false);
      setFetchingSite(false);
      return;
    }
    router.push(`/projects/${result.projectId}`);
  }

  return (
    <form action={onSubmit} className="mt-8 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">What&apos;s your product called?</Label>
        <Input id="name" name="name" required placeholder="e.g. Acme Analytics" autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">
          Website URL{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <div className="relative">
          <Globe className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            id="website"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yourstartup.com"
            className="pl-9"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          {fetchingSite
            ? "Reading your site so the interview starts informed…"
            : "If you add it, Markoby reads your site first and skips asking what it already answers."}
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {fetchingSite ? "Reading your site…" : "Creating project…"}
          </>
        ) : (
          <>
            Start the interview
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        No website? No problem — the interview covers everything.
      </p>
    </form>
  );
}
