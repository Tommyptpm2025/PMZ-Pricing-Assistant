"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Printer,
  Paperclip,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadJobs,
  saveJobs,
  updateRecipeRowActual,
  setJobNotes,
  completeJob,
  reopenJob,
  deleteJob,
  createId,
  type Job,
} from "@/lib/jobs";

// Quantity formatter — up to 2 decimals, no trailing-zero noise. NO currency anywhere here:
// the Foreman Work Order is field-execution only (cost lives in the Pricer, never on this view).
function fmtQty(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Work-order status badge presentation, keyed by Job.status string so a future "scheduled" state
// renders without a model change. Mirrors the quote lifecycle: Scheduled + Work Order Active are
// blue; Completed is green. Falls back to the active (blue) treatment for any unknown status.
const JOB_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Work Order Active", className: "border-blue-600 text-blue-700 bg-blue-50" },
  scheduled: { label: "Scheduled", className: "border-blue-600 text-blue-700 bg-blue-50" },
  completed: { label: "Completed", className: "border-emerald-600 text-emerald-700 bg-emerald-50" },
};
function jobStatusBadge(status: string) {
  return JOB_STATUS_BADGE[status] ?? JOB_STATUS_BADGE.open;
}

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
  // Per-row raw input strings while editing actuals, so the foreman can type decimals ("31.5")
  // without the controlled number coercing the trailing dot away. Committed value is the parsed
  // number stored on the job; this map is just the in-flight text. Reset when switching jobs.
  const [actualDrafts, setActualDrafts] = React.useState<Record<string, string>>({});

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

  function refresh() {
    setJobs(loadJobs());
  }

  function selectJob(id: string) {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    setSelectedId(id);
    setNotesDraft(job.notes || "");
    setActualDrafts({});
    setJustSaved(false);
  }

  function clearSelection() {
    setSelectedId(null);
    setNotesDraft("");
    setActualDrafts({});
  }

  // Foreman actuals entry against the cost-stripped recipe rows. Empty / "." / "-" clears the row
  // back to "not yet entered" (null); otherwise a non-negative number is committed to the job.
  function handleActualChange(rowId: string, raw: string) {
    setActualDrafts((d) => ({ ...d, [rowId]: raw }));
    if (!selectedId) return;
    const trimmed = raw.trim();
    let val: number | null = null;
    if (trimmed !== "" && trimmed !== "." && trimmed !== "-") {
      const n = parseFloat(trimmed);
      if (!isNaN(n) && n >= 0) val = n;
    }
    setJobs((prev) => updateRecipeRowActual(prev, selectedId, rowId, val));
  }

  function saveNotes() {
    if (!selectedId) return;
    setJobs((prev) => setJobNotes(prev, selectedId, notesDraft));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1400);
  }

  function doComplete() {
    if (!selectedId) return;
    setJobs((prev) => completeJob(prev, selectedId));
  }

  function doReopen() {
    if (!selectedId) return;
    setJobs((prev) => reopenJob(prev, selectedId));
  }

  function doDelete(id: string) {
    if (!confirm("Delete this job permanently?")) return;
    setJobs((prev) => deleteJob(prev, id));
    if (selectedId === id) {
      clearSelection();
    }
  }

  // Demo job creator (so you can test the foreman flow without a full pricer quote). Seeds the
  // cost-stripped recipeLines (per bid line + a crew group) so the work order renders end-to-end.
  function loadDemoJob() {
    const now = new Date().toISOString();
    const demo: Job = {
      id: createId(),
      createdAt: now,
      status: "open",
      jobName: "Demo: Elm Street Patch Paving",
      customerName: "Springfield Public Works",
      workTypeName: "Residential Paving",
      salesperson: "Owner",
      contractValue: 18750,
      bidItems: [],
      recipe: [],
      actuals: {},
      recipeLines: [
        {
          id: createId(),
          lineId: "b1",
          description: "Asphalt Patching & Base Repair",
          sections: [
            {
              title: "Labor",
              isCrew: false,
              rows: [
                { id: createId(), name: "Skid Steer Operator", plannedQty: 24, unit: "hrs", actualQty: 22 },
                { id: createId(), name: "Laborer - Grade", plannedQty: 48, unit: "hrs", actualQty: null },
              ],
            },
            {
              title: "Equipment",
              isCrew: false,
              rows: [
                { id: createId(), name: "Skid Steer 75HP", plannedQty: 22, unit: "hrs", actualQty: 24 },
              ],
            },
            {
              title: "Material",
              isCrew: false,
              rows: [
                { id: createId(), name: '3/4" Gravel Base', plannedQty: 28, unit: "Ton", actualQty: 31 },
                { id: createId(), name: '4" Asphalt Mix', plannedQty: 95, unit: "Ton", actualQty: null },
              ],
            },
          ],
        },
        {
          id: createId(),
          lineId: "b2",
          description: "Mobilization & Traffic Control",
          sections: [
            {
              title: "Crew: Traffic Crew",
              isCrew: true,
              rows: [
                { id: createId(), name: "Flagger", plannedQty: 16, unit: "hrs", actualQty: null },
                { id: createId(), name: "Traffic Control Truck", plannedQty: 8, unit: "hrs", actualQty: null },
              ],
            },
          ],
        },
      ],
      attachments: [],
      jobSite: {
        address: "1420 Elm Street, Springfield, IL 62704",
        latitude: 39.78172,
        longitude: -89.65014,
        accessNotes:
          "Gate code #4821. Stage trailers on the north lot — do not block the loading dock. Owner on-site after 7:00 AM.",
      },
      intakeNotes:
        "Customer flagged soft soil near the east edge after spring rain — verify base compaction before paving.",
      notes: "",
    };
    setJobs((prev) => [...prev, demo]);
    setTimeout(() => {
      setSelectedId(demo.id);
      setNotesDraft(demo.notes || "");
      setActualDrafts({});
    }, 0);
  }

  function clearAllJobs() {
    if (!confirm("Clear ALL jobs? This cannot be undone.")) return;
    setJobs([]);
    clearSelection();
  }

  const hasJobs = jobs.length > 0;
  const isLocked = selectedJob?.status === "completed";

  return (
    <div className="max-w-6xl space-y-6 pb-12">
      {/* Print rules: clean letter page, 0.5in margins, matching the quote PDF. Everything that
          isn't the selected work order is .wo-noprint; the actuals inputs swap to plain text. */}
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          html, body { background: #fff !important; }
          .wo-noprint { display: none !important; }
          .wo-print-clean { box-shadow: none !important; border-color: #d1d5db !important; }
          .wo-recipe-line { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 wo-noprint">
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
              The field work order: job site, the planned recipe per line, and actuals entry. No pricing — this is execution only.
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
      <Card className="card overflow-hidden wo-noprint">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Jobs</CardTitle>
            <div className="flex items-center gap-1 text-xs">
              <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} className="px-2.5 text-xs" onClick={() => setStatusFilter("all")}>
                All
              </Button>
              <Button size="sm" variant={statusFilter === "open" ? "default" : "outline"} className="px-2.5 text-xs" onClick={() => setStatusFilter("open")}>
                Active
              </Button>
              <Button size="sm" variant={statusFilter === "completed" ? "default" : "outline"} className="px-2.5 text-xs" onClick={() => setStatusFilter("completed")}>
                Completed
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!hasJobs ? (
            <div className="p-8 text-center text-muted-foreground">
              No jobs yet. Go to <Link href="/project-pricer" className="underline">Project Pricer</Link>, accept a quote, then click <strong>Create Work Order</strong>.
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
                    <TableHead>Customer</TableHead>
                    <TableHead>Work Type</TableHead>
                    <TableHead>Status</TableHead>
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
                          <TableCell className="text-sm text-muted-foreground">{job.customerName || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{job.workTypeName || "—"}</TableCell>
                          <TableCell>
                            {(() => {
                              const p = jobStatusBadge(job.status);
                              return (
                                <Badge variant="outline" className={cn(p.className)}>
                                  {job.status === "completed" ? (
                                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {p.label}</span>
                                  ) : p.label}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{created}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); selectJob(job.id); }} title="Open work order">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive/70 hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); doDelete(job.id); }}
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

      {/* Selected Job — Foreman Work Order */}
      {selectedJob && (
        <div className="space-y-4">
          {/* Toolbar (not printed) */}
          <div className="flex items-center justify-between wo-noprint">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" onClick={clearSelection} className="pl-1">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to list
              </Button>
              <span>•</span>
              <span>Job ID: {selectedJob.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print Work Order
              </Button>
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

          {/* HEADER SECTION */}
          <Card className="card wo-print-clean">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div>
                  <div className="text-xs uppercase tracking-[1.5px] text-muted-foreground">WORK ORDER</div>
                  <div className="text-2xl font-semibold tracking-[-0.02em] mt-0.5">{selectedJob.jobName}</div>
                  <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                    {selectedJob.customerName && <div><span className="text-foreground/70 font-medium">Customer:</span> {selectedJob.customerName}</div>}
                    <div><span className="text-foreground/70 font-medium">Work Type:</span> {selectedJob.workTypeName || "—"}</div>
                    <div><span className="text-foreground/70 font-medium">Salesperson:</span> {selectedJob.salesperson || "—"}</div>
                  </div>
                </div>
                <div className="text-right">
                  {(() => {
                    const p = jobStatusBadge(selectedJob.status);
                    return (
                      <Badge variant="outline" className={cn("text-sm", p.className)}>
                        {p.label}
                      </Badge>
                    );
                  })()}
                  {selectedJob.completedAt && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Completed {new Date(selectedJob.completedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SITE SECTION */}
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
              <Card className="card wo-print-clean">
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
                              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                {site.address}
                              </a>
                            ) : (
                              site.address
                            )}
                          </div>
                        </div>
                      )}
                      {hasGps && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">GPS Coordinates</div>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 font-medium tabular-nums text-primary hover:underline"
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            {lat!.toFixed(5)}, {lng!.toFixed(5)}
                            <span className="text-xs font-normal text-muted-foreground wo-noprint">(open in Maps)</span>
                          </a>
                        </div>
                      )}
                      {site?.accessNotes && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">Access / Delivery Instructions</div>
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

          {/* RECIPE SECTION — per bid line, cost-stripped, with actuals entry + variance */}
          <Card className="card wo-print-clean">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recipe &amp; Actuals</CardTitle>
                <span className="text-xs text-muted-foreground wo-noprint">
                  {isLocked ? "Job complete — actuals locked." : "Enter actual quantities. Saves automatically."}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {(!selectedJob.recipeLines || selectedJob.recipeLines.length === 0) ? (
                <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                  This work order has no detailed recipe.
                  <br />You can still mark it complete and use the notes field for post-job learnings.
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedJob.recipeLines.map((line) => (
                    <div key={line.id} className="wo-recipe-line">
                      <div className="text-sm font-semibold tracking-[-0.01em] border-b pb-1.5 mb-2">
                        {line.description || "Untitled line"}
                      </div>
                      <div className="space-y-4">
                        {line.sections.map((section, si) => (
                          <div key={si}>
                            <div
                              className={cn(
                                "text-xs font-medium tracking-wider mb-1 flex items-center gap-1.5",
                                section.isCrew ? "text-[#7D1424]" : "text-muted-foreground"
                              )}
                            >
                              {section.isCrew && <Users className="h-3.5 w-3.5" />}
                              {section.title.toUpperCase()}
                            </div>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/30">
                                    <TableHead>Item</TableHead>
                                    <TableHead className="w-32 text-right">Planned</TableHead>
                                    <TableHead className="w-32 text-right">Actual</TableHead>
                                    <TableHead className="w-28 text-right">Variance</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {section.rows.map((row) => {
                                    const variance = row.actualQty == null ? null : row.actualQty - row.plannedQty;
                                    const overPlan = variance != null && variance > 0;
                                    const draftVal =
                                      actualDrafts[row.id] !== undefined
                                        ? actualDrafts[row.id]
                                        : row.actualQty == null
                                        ? ""
                                        : String(row.actualQty);
                                    return (
                                      <TableRow key={row.id}>
                                        <TableCell className="font-medium py-2">{row.name}</TableCell>
                                        <TableCell className="text-right tabular-nums py-2">
                                          {fmtQty(row.plannedQty)} <span className="text-muted-foreground text-xs">{row.unit}</span>
                                        </TableCell>
                                        <TableCell className="text-right py-1.5">
                                          {/* On screen: editable input. In print: plain value. */}
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={draftVal}
                                            onChange={(e) => handleActualChange(row.id, e.target.value)}
                                            disabled={isLocked}
                                            placeholder="—"
                                            className="wo-noprint h-9 w-24 text-right tabular-nums border border-input rounded px-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60"
                                          />
                                          <span className="hidden print:inline tabular-nums">
                                            {row.actualQty == null ? "—" : `${fmtQty(row.actualQty)} ${row.unit}`}
                                          </span>
                                        </TableCell>
                                        <TableCell
                                          className={cn(
                                            "text-right tabular-nums py-2 font-medium",
                                            variance == null ? "text-muted-foreground" : overPlan ? "text-red-600" : "text-emerald-600"
                                          )}
                                        >
                                          {variance == null ? "—" : `${variance > 0 ? "+" : ""}${fmtQty(variance)} ${row.unit}`}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Foreman notes (not printed) */}
              <div className="mt-6 wo-noprint">
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
                  className="w-full min-h-[92px] rounded-md border p-3 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60"
                  disabled={isLocked}
                />
                {justSaved && <div className="text-[10px] text-emerald-600 mt-1">Notes saved.</div>}
                {isLocked && <div className="text-[10px] text-muted-foreground mt-1">Job is completed — notes are locked.</div>}
              </div>
            </CardContent>
          </Card>

          {/* ATTACHMENTS PLACEHOLDER — reserved for Build G (non-clickable) */}
          <div
            className="wo-noprint flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground/70 select-none cursor-not-allowed"
            aria-disabled="true"
          >
            <Paperclip className="h-4 w-4" />
            Attachments (coming soon)
          </div>

          {selectedJob.status === "open" && (
            <div className="text-xs text-muted-foreground px-1 flex items-center gap-2 wo-noprint">
              <AlertTriangle className="h-3.5 w-3.5" />
              When the job is done, click “Mark Job Complete” to lock the actuals.
            </div>
          )}
        </div>
      )}

      {/* Footer hint (not printed) */}
      <div className="text-center text-xs text-muted-foreground max-w-prose mx-auto pt-2 wo-noprint">
        The foreman work order is field-execution only — site, recipe, and actuals. No pricing ever appears here.
        <br />Currently data lives in your browser (localStorage). Full multi-user sync coming later.
      </div>
    </div>
  );
}
