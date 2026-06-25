"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClipboardList,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Eye,
  Save,
  AlertTriangle,
  ArrowLeft,
  MapPin,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadJobs,
  saveJobs,
  updateJobActual,
  setJobNotes,
  completeJob,
  reopenJob,
  deleteJob,
  computeVariance,
  summarizeVariance,
  createId,
  type Job,
  type JobLEMItem,
} from "@/lib/jobs";

export default function JobsForemanPage() {
  const [jobs, setJobs] = React.useState<Job[]>(() => {
    try {
      return loadJobs();
    } catch {
      return [];
    }
  });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<"all" | "open" | "completed">("all");
  const [notesDraft, setNotesDraft] = React.useState("");
  const [justSaved, setJustSaved] = React.useState(false);

  // Persist on any jobs change (jobs array identity changes on mutations)
  React.useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

  const selectedJob = React.useMemo(
    () => jobs.find((j) => j.id === selectedId) || null,
    [jobs, selectedId]
  );

  const filteredJobs = React.useMemo(() => {
    let list = [...jobs];
    if (statusFilter !== "all") {
      list = list.filter((j) => j.status === statusFilter);
    }
    // newest first
    list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    return list;
  }, [jobs, statusFilter]);

  // Live variance for selected
  const varianceLines = React.useMemo(() => {
    if (!selectedJob) return [];
    return computeVariance(selectedJob);
  }, [selectedJob]);

  const varianceSummary = React.useMemo(() => {
    return summarizeVariance(varianceLines);
  }, [varianceLines]);

  function refresh() {
    setJobs(loadJobs());
  }

  function selectJob(id: string) {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    setSelectedId(id);
    setNotesDraft(job.notes || "");
    setJustSaved(false);
  }

  function clearSelection() {
    setSelectedId(null);
    setNotesDraft("");
  }

  function handleActualChange(recipeItemId: string, raw: string) {
    if (!selectedId) return;
    const trimmed = raw.trim();
    let val = 0;
    if (trimmed !== "" && trimmed !== "." && trimmed !== "-") {
      const n = parseFloat(trimmed);
      if (!isNaN(n) && n >= 0) val = n;
    }
    const updated = updateJobActual(jobs, selectedId, recipeItemId, val);
    setJobs(updated);
  }

  function saveNotes() {
    if (!selectedId) return;
    const updated = setJobNotes(jobs, selectedId, notesDraft);
    setJobs(updated);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1400);
  }

  function doComplete() {
    if (!selectedId) return;
    const updated = completeJob(jobs, selectedId);
    setJobs(updated);
  }

  function doReopen() {
    if (!selectedId) return;
    const updated = reopenJob(jobs, selectedId);
    setJobs(updated);
  }

  function doDelete(id: string) {
    if (!confirm("Delete this job permanently?")) return;
    const updated = deleteJob(jobs, id);
    setJobs(updated);
    if (selectedId === id) {
      clearSelection();
    }
  }

  // Demo job creator (so you can test the flow without a full pricer quote)
  function loadDemoJob() {
    const now = new Date().toISOString();
    const recipe: JobLEMItem[] = [
      { id: createId(), type: "labor", description: "Skid Steer Operator", plannedQty: 24, unitCost: 68.5 },
      { id: createId(), type: "labor", description: "Laborer - Grade", plannedQty: 48, unitCost: 52.25 },
      { id: createId(), type: "equipment", description: "Skid Steer 75HP", plannedQty: 22, unitCost: 38.0 },
      { id: createId(), type: "material", description: "3/4\" Gravel Base (ton)", plannedQty: 28, unitCost: 42.0 },
      { id: createId(), type: "material", description: "4\" Asphalt Mix (ton)", plannedQty: 95, unitCost: 87.5 },
    ];
    const actuals: Record<string, number> = {};
    recipe.forEach((r) => {
      actuals[r.id] = r.type === "labor" ? Math.round(r.plannedQty * 0.95) : Math.round(r.plannedQty * 1.1);
    });

    const demo: Job = {
      id: createId(),
      createdAt: now,
      status: "open",
      jobName: "Demo: Elm Street Patch Paving",
      workTypeName: "Residential Paving",
      salesperson: "Owner",
      contractValue: 18750,
      bidItems: [
        { id: "b1", description: "Asphalt Patching & Base Repair", quantity: 1850, unit: "SF", unitPrice: 9.5 },
        { id: "b2", description: "Mobilization & Traffic", quantity: 1, unit: "LS", unitPrice: 1250 },
      ],
      recipe,
      actuals,
      jobSite: {
        address: "1420 Elm Street, Springfield, IL 62704",
        latitude: 39.78172,
        longitude: -89.65014,
        accessNotes:
          "Gate code #4821. Stage trailers on the north lot — do not block the loading dock. Owner on-site after 7:00 AM.",
      },
      intakeNotes:
        "Customer flagged soft soil near the east edge after spring rain — verify base compaction before paving.",
      notes: "Demo job seeded with slightly over/under actuals for variance preview.",
    };
    setJobs((prev) => [...prev, demo]);
    // auto open the new one
    setTimeout(() => {
      setSelectedId(demo.id);
      setNotesDraft(demo.notes || "");
    }, 0);
  }

  function clearAllJobs() {
    if (!confirm("Clear ALL jobs? This cannot be undone.")) return;
    setJobs([]);
    clearSelection();
  }

  const hasJobs = jobs.length > 0;

  return (
    <div className="max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
            <ClipboardList className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">Jobs / Foreman View</h1>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-primary/40 text-primary">
                EXECUTION
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              Accept a quote from Project Pricer to create a Job. Foreman sees the Recipe (planned quantities) and logs Actuals. Variance feeds the learning loop.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={loadDemoJob}>
            Load Demo Job
          </Button>
          {hasJobs && (
            <Button variant="ghost" size="sm" onClick={clearAllJobs} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" /> Clear All
            </Button>
          )}
        </div>
      </div>

      {/* List of Jobs */}
      <Card className="card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Jobs</CardTitle>
            <div className="flex items-center gap-1 text-xs">
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                className="px-2.5 text-xs"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "open" ? "default" : "outline"}
                className="px-2.5 text-xs"
                onClick={() => setStatusFilter("open")}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "completed" ? "default" : "outline"}
                className="px-2.5 text-xs"
                onClick={() => setStatusFilter("completed")}
              >
                Completed
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!hasJobs ? (
            <div className="p-8 text-center text-muted-foreground">
              No jobs yet. Go to <Link href="/project-pricer" className="underline">Project Pricer</Link>, build a bid + real LEM recipe, then click <strong>Accept Quote &amp; Create Job</strong>.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={loadDemoJob}>Or load a demo job here</Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Job</TableHead>
                    <TableHead>Work Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Contract Value</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                        No jobs match the current filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredJobs.map((job) => {
                      const isSel = job.id === selectedId;
                      const created = new Date(job.createdAt).toLocaleDateString();
                      return (
                        <TableRow
                          key={job.id}
                          className={cn("hover:bg-muted/20 cursor-pointer", isSel && "bg-primary/5")}
                          onClick={() => selectJob(job.id)}
                        >
                          <TableCell className="font-medium">{job.jobName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{job.workTypeName || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                job.status === "completed"
                                  ? "border-emerald-600 text-emerald-700 bg-emerald-50"
                                  : "border-blue-600 text-blue-700 bg-blue-50"
                              )}
                            >
                              {job.status === "completed" ? (
                                <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</span>
                              ) : "Open"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            ${job.contractValue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{created}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectJob(job.id);
                              }}
                              title="Open / Edit"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive/70 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                doDelete(job.id);
                              }}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Job Detail / Foreman Workspace */}
      {selectedJob && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" onClick={clearSelection} className="pl-1">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to list
              </Button>
              <span>•</span>
              <span>Job ID: {selectedJob.id}</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedJob.status === "open" ? (
                <Button onClick={doComplete} variant="default">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Job Complete
                </Button>
              ) : (
                <Button onClick={doReopen} variant="outline">
                  <RotateCcw className="mr-2 h-4 w-4" /> Reopen Job
                </Button>
              )}
              <Button variant="ghost" onClick={() => doDelete(selectedJob.id)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </div>
          </div>

          {/* Job Header Card */}
          <Card className="card">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div>
                  <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">JOB</div>
                  <div className="text-2xl font-semibold tracking-[-0.02em] mt-0.5">{selectedJob.jobName}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {selectedJob.workTypeName} • Sales: {selectedJob.salesperson}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">CONTRACT VALUE</div>
                  <div className="text-3xl font-semibold tabular-nums tracking-tighter mt-0.5">
                    ${selectedJob.contractValue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </div>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        selectedJob.status === "completed"
                          ? "border-emerald-600 text-emerald-700 bg-emerald-50"
                          : "border-blue-600 text-blue-700 bg-blue-50"
                      )}
                    >
                      {selectedJob.status.toUpperCase()}
                    </Badge>
                    {selectedJob.completedAt && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Completed {new Date(selectedJob.completedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Job Site / Intake Context — what the crew needs to see before they start */}
          {(() => {
            const site = selectedJob.jobSite;
            const intake = selectedJob.intakeNotes?.trim();
            const lat = site?.latitude;
            const lng = site?.longitude;
            const hasGps = lat != null && lng != null;
            const hasAny = !!(site?.address || hasGps || site?.accessNotes || intake);
            const mapsHref = hasGps
              ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
              : site?.address
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`
              : null;
            return (
              <Card className="card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> JOB SITE
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {!hasAny ? (
                    <div className="text-sm text-muted-foreground">No site details on file.</div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {site?.address && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Site Address</div>
                          <div className="mt-0.5 font-medium">
                            {mapsHref ? (
                              <a
                                href={mapsHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {site.address}
                              </a>
                            ) : (
                              site.address
                            )}
                          </div>
                        </div>
                      )}
                      {lat != null && lng != null && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">GPS Coordinates</div>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 font-medium tabular-nums text-primary hover:underline"
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            {lat.toFixed(5)}, {lng.toFixed(5)}
                            <span className="text-xs font-normal text-muted-foreground">(open in Maps)</span>
                          </a>
                        </div>
                      )}
                      {site?.accessNotes && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">
                            Access / Delivery Instructions
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap">{site.accessNotes}</div>
                        </div>
                      )}
                      {intake && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Intake Notes</div>
                          <div className="mt-0.5 whitespace-pre-wrap">{intake}</div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Original Bid / Quote Lines (snapshot) */}
          {selectedJob.bidItems.length > 0 && (
            <Card className="card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium tracking-wider text-muted-foreground">QUOTE / BID LINES (SNAPSHOT)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Description</TableHead>
                        <TableHead className="w-20 text-right">Qty</TableHead>
                        <TableHead className="w-16">Unit</TableHead>
                        <TableHead className="w-24 text-right">Unit Price</TableHead>
                        <TableHead className="w-28 text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedJob.bidItems.map((b) => {
                        const lt = b.quantity * b.unitPrice;
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{b.description}</TableCell>
                            <TableCell className="text-right tabular-nums">{b.quantity}</TableCell>
                            <TableCell className="text-muted-foreground">{b.unit}</TableCell>
                            <TableCell className="text-right tabular-nums">${b.unitPrice.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">${lt.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/20 font-medium">
                        <TableCell colSpan={4} className="text-right">Bid Total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${selectedJob.bidItems.reduce((s, b) => s + b.quantity * b.unitPrice, 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">This is what the customer was quoted. The Recipe below is the internal plan (LEM quantities) that was accepted with it.</p>
              </CardContent>
            </Card>
          )}

          {/* THE RECIPE + ACTUALS — core foreman screen */}
          <Card className="card border-emerald-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  Recipe (Planned) → Actuals
                  {selectedJob.status === "completed" && (
                    <Badge className="ml-2 bg-emerald-600">Variance Report Ready</Badge>
                  )}
                </CardTitle>
                <CardDescription>Enter what was actually used. Numbers save automatically.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {selectedJob.recipe.length === 0 ? (
                <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                  This job was accepted without a detailed LEM recipe.
                  <br />You can still complete it and use the notes field for post-job learnings.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-24">Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-28 text-right">Planned Qty</TableHead>
                        <TableHead className="w-28 text-right">Actual Qty</TableHead>
                        <TableHead className="w-24 text-right">Unit Rate</TableHead>
                        <TableHead className="w-24 text-right">Planned $</TableHead>
                        <TableHead className="w-24 text-right">Actual $</TableHead>
                        <TableHead className="w-24 text-right">Delta $</TableHead>
                        <TableHead className="w-20 text-right">Var %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {varianceLines.map((line) => {
                        const currentActual = selectedJob.actuals[line.id] ?? 0;
                        return (
                          <TableRow key={line.id} className="align-top">
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-[10px]">{line.type}</Badge>
                            </TableCell>
                            <TableCell className="font-medium py-2">{line.description}</TableCell>
                            <TableCell className="text-right tabular-nums py-2">{line.plannedQty}</TableCell>
                            <TableCell className="py-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={currentActual}
                                onChange={(e) => handleActualChange(line.id, e.target.value)}
                                className="h-9 w-24 text-right tabular-nums border border-input rounded px-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                disabled={selectedJob.status === "completed"}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs py-2">${line.unitCost.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums py-2">${line.plannedCost.toFixed(2)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium py-2">${line.actualCost.toFixed(2)}</TableCell>
                            <TableCell className={cn("text-right tabular-nums py-2", line.costDelta >= 0 ? "text-red-600" : "text-emerald-600")}>
                              {line.costDelta >= 0 ? "+" : ""}${line.costDelta.toFixed(2)}
                            </TableCell>
                            <TableCell className={cn("text-right tabular-nums py-2 text-xs", Math.abs(line.costVariancePct) > 10 ? "font-semibold" : "")}>
                              {line.costVariancePct > 0 ? "+" : ""}{line.costVariancePct.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Variance Summary */}
              {selectedJob.recipe.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 bg-white">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Planned LEM Total</div>
                    <div className="text-2xl font-semibold tabular-nums mt-1">${varianceSummary.plannedTotal.toFixed(2)}</div>
                  </div>
                  <div className="rounded-lg border p-3 bg-white">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Actual LEM Total</div>
                    <div className="text-2xl font-semibold tabular-nums mt-1">${varianceSummary.actualTotal.toFixed(2)}</div>
                  </div>
                  <div className={cn("rounded-lg border p-3", varianceSummary.delta >= 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200")}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Variance (Actual − Planned)</div>
                    <div className={cn("text-2xl font-semibold tabular-nums mt-1", varianceSummary.delta >= 0 ? "text-red-700" : "text-emerald-700")}>
                      {varianceSummary.delta >= 0 ? "+" : ""}${varianceSummary.delta.toFixed(2)}
                      <span className="text-base align-super ml-1">({varianceSummary.variancePct >= 0 ? "+" : ""}{varianceSummary.variancePct.toFixed(1)}%)</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Positive = over budget on direct costs</div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-medium tracking-wider text-muted-foreground">FOREMAN NOTES / LESSONS LEARNED</div>
                  <Button size="sm" variant="outline" onClick={saveNotes} className="px-2 text-xs">
                    <Save className="mr-1 h-3.5 w-3.5" /> Save Notes
                  </Button>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Crew notes, surprises, what to adjust in future bids (e.g. 'used 30% more gravel than planned due to soft subgrade')..."
                  className="w-full min-h-[92px] rounded-md border p-3 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  disabled={selectedJob.status === "completed"}
                />
                {justSaved && <div className="text-[10px] text-emerald-600 mt-1">Notes saved.</div>}
                {selectedJob.status === "completed" && (
                  <div className="text-[10px] text-muted-foreground mt-1">Job is completed — notes are locked.</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Completion / Variance Report callout */}
          {selectedJob.status === "completed" && (
            <Card className="border-emerald-300 bg-emerald-50/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" /> Variance Report — Estimate vs Actual
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-emerald-900/90">
                This job is complete. The numbers above (and any notes) are now part of your historical record.
                In future bidding the team can reference these actuals to tighten recipes for similar work types.
                <div className="mt-2 text-[11px] opacity-80">Next step (future): auto-suggest quantities in Project Pricer based on completed job averages.</div>
              </CardContent>
            </Card>
          )}

          {selectedJob.status === "open" && (
            <div className="text-xs text-muted-foreground px-1 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              When ready, click “Mark Job Complete”. This locks the actuals and produces the final variance report for learning.
            </div>
          )}
        </div>
      )}

      {/* Learning loop hint */}
      <div className="text-center text-xs text-muted-foreground max-w-prose mx-auto pt-2">
        Completed jobs with actuals close the loop: the Recipe you accept today becomes tomorrow’s better starting point in Project Pricer.
        <br />Currently data lives in your browser (localStorage). Full multi-user + analytics coming later.
      </div>
    </div>
  );
}
