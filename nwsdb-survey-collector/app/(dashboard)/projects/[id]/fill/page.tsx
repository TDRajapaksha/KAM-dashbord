"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";
import { getMyPermission } from "@/lib/api";

type Question = {
  id: string;
  type: string;
  label: string;
  choices: any;
};

function parsePointCoordinates(value: string) {
  let decodedValue = value;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    // Keep the original value when a pasted URL contains malformed escapes.
  }

  const coordinatePatterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /(?:Lat(?:itude)?\s*[:=]\s*)?(-?\d+(?:\.\d+)?)\s*,\s*(?:Lng(?:itude)?\s*[:=]\s*)?(-?\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of coordinatePatterns) {
    const match = decodedValue.match(pattern);
    if (!match) continue;

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export default function FillFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [projectName, setProjectName] = useState("");
  const [projectStatus, setProjectStatus] = useState<string>("draft");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mediaUploadsInProgress, setMediaUploadsInProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [attemptCount, setAttemptCount] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const me = getUser();
        if (!me) {
          setError("You're not logged in.");
          return;
        }

        // Permission check — must be owner, edit, or fill
        const perm = await getMyPermission(id);
        if (!perm) {
          setError("You don't have access to this project.");
          return;
        }

        // Load project (name + status)
        const { data: project } = await supabase
          .from("projects")
          .select("name, status")
          .eq("id", id)
          .maybeSingle();
        if (project) {
          setProjectName(project.name ?? "");
          setProjectStatus(project.status ?? "draft");
        }

        // Load questions
        const { data: qs, error: qErr } = await supabase
          .from("questions")
          .select("id, type, label, choices")
          .eq("project_id", id)
          .order("created_at", { ascending: true });
        if (qErr) throw qErr;
        setQuestions((qs ?? []) as Question[]);

        // Count existing attempts by this user
        const { count } = await supabase
          .from("responses")
          .select("id", { count: "exact", head: true })
          .eq("project_id", id)
          .eq("submitted_by", me.id);
        setAttemptCount(count ?? 0);
      } catch (e: any) {
        setError(e.message ?? "Failed to load form.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function setAnswer(qid: string, value: any) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  async function submit() {
    // Safety check — block if project isn't deployed
    if (projectStatus !== "deployed") {
      setError(
        projectStatus === "archived"
          ? "This project is archived — responses are not accepted."
          : "This project is still a draft — ask the owner to deploy it first."
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const me = getUser();
      if (!me) throw new Error("You're not logged in.");

            // Extract geo coordinates from any Point answers
      let geoLat: number | null = null;
      let geoLng: number | null = null;
      const finalAnswers = { ...answers };

      for (const q of questions) {
        if (q.type === "Point") {
          let v = finalAnswers[q.id]?.toString() ?? "";
          
          // 🚀 If it's a short link, ask the API to expand it
          if (v.includes("maps.app.goo.gl") || v.includes("goo.gl")) {
            try {
              const res = await fetch(`/api/resolve-link?url=${encodeURIComponent(v)}`);
              const data = await res.json();
              
              if (data.resolvedUrl && data.resolvedUrl !== v) {
                v = data.resolvedUrl; // Use the expanded long link
                finalAnswers[q.id] = v; 
              }
            } catch (e) {
              console.error("Could not expand link", e);
            }
          }

          // Parse the coordinates from the (now long) link
          const coordinates = parsePointCoordinates(v);
          if (coordinates) {
            geoLat = coordinates.lat;
            geoLng = coordinates.lng;
            // Ensure the saved answer is a perfect URL with the coordinates
            finalAnswers[q.id] = `https://www.google.com/maps/search/?api=1&query=${geoLat},${geoLng}`;
          }
        }
      }
      
            const { error: insertErr } = await supabase.from("responses").insert({
        project_id: id,
        submitted_by: me.id,
        answers: finalAnswers, // 🚀 Use the fixed answers here!
        geo_lat: geoLat,
        geo_lng: geoLng,
        media: Object.fromEntries(
          // ... keep the rest the same
          questions
            .filter(
              (question) =>
                ["Photo", "Audio", "Video", "File"].includes(question.type) &&
                typeof answers[question.id] === "string" &&
                answers[question.id]
            )
            .map((question) => [question.id, answers[question.id]])
        ),
      });
      if (insertErr) throw insertErr;

      setAttemptCount((n) => n + 1);
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Loading form…
      </div>
    );

  if (error && !done && questions.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-12 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
        <Link
          href="/projects"
          className="mt-4 inline-block text-sm text-[#004C99] hover:underline"
        >
          ← Back to projects
        </Link>
      </div>
    );
  }

  if (done)
    return (
      <div className="mx-auto max-w-2xl p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Response submitted!
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Thanks. This is your {attemptCount}
          {attemptCount === 1 ? "st" : attemptCount === 2 ? "nd" : attemptCount === 3 ? "rd" : "th"}{" "}
          submission for this project.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              setAnswers({});
              setDone(false);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Submit another
          </button>
          <Link
            href={`/projects/${id}`}
            className="rounded-lg bg-[#004C99] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003d7a]"
          >
            Back to project
          </Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href={`/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        ← Back to project
      </Link>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="bg-[#004C99] px-6 py-4">
          <h1 className="text-lg font-semibold text-white">{projectName}</h1>
          <p className="mt-1 text-xs text-blue-100">
            Fill in the answers and submit. You can submit multiple times.
            {attemptCount > 0 && (
              <span className="ml-1">
                ({attemptCount} previous{" "}
                {attemptCount === 1 ? "attempt" : "attempts"})
              </span>
            )}
          </p>
        </div>

        <div className="space-y-5 px-6 py-6">
          {/* Deployed-only banner */}
          {projectStatus !== "deployed" && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                projectStatus === "archived"
                  ? "border-orange-200 bg-orange-50 text-orange-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {projectStatus === "archived"
                ? "This project has been archived. Responses are no longer accepted."
                : "This project is still a draft. The owner has not deployed it yet — you can fill in answers but they won't be saved until deployed."}
            </div>
          )}

          {questions.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              This form has no questions yet.
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id}>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {i + 1}. {q.label}
                </label>
                <QuestionInput
                  question={q}
                  projectId={id}
                  projectStatus={projectStatus}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                  onUploadStateChange={(uploading) =>
                    setMediaUploadsInProgress((count) =>
                      Math.max(0, count + (uploading ? 1 : -1))
                    )
                  }
                />
              </div>
            ))
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {questions.length > 0 && (
            <div className="flex items-end justify-end gap-2 pt-2">
              <Link
                href={`/projects/${id}`}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>

              {projectStatus === "deployed" ? (
                <button
                  onClick={submit}
                  disabled={submitting || mediaUploadsInProgress > 0}
                  className="rounded-lg bg-[#004C99] px-5 py-2 text-sm font-semibold text-white hover:bg-[#003d7a] disabled:opacity-50"
                >
                  {submitting
                    ? "Submitting…"
                    : mediaUploadsInProgress > 0
                      ? "Uploading…"
                      : "Submit"}
                </button>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <button
                    disabled
                    className="cursor-not-allowed rounded-lg bg-gray-300 px-5 py-2 text-sm font-semibold text-white"
                  >
                    Submit
                  </button>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {projectStatus === "archived"
                      ? "Archived — submissions closed."
                      : "Waiting for the owner to deploy."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  projectId,
  projectStatus,
  value,
  onChange,
  onUploadStateChange,
}: {
  question: Question;
  projectId: string;
  projectStatus: string;
  value: any;
  onChange: (v: any) => void;
  onUploadStateChange: (uploading: boolean) => void;
}) {
  const type = question.type;
  const choices: string[] = Array.isArray(question.choices)
    ? question.choices.map(String)
    : [];
  const [locating, setLocating] = useState(false);
  const [pointError, setPointError] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#004C99] focus:outline-none";

  if (["Photo", "Audio", "Video", "File"].includes(type)) {
    const maxFileSize = 50 * 1024 * 1024;
    const accept =
      type === "Photo"
        ? "image/*"
        : type === "Audio"
          ? "audio/*"
          : type === "Video"
            ? "video/*"
            : undefined;

    async function uploadMedia(file: File) {
      setUploadingMedia(true);
      setMediaError(null);
      onUploadStateChange(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("questionId", question.id);

        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/media-upload`,
          {
            method: "POST",
            body: formData,
          }
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "File upload failed.");
        }

        onChange(result.url);
      } catch (e: any) {
        setMediaError(e.message ?? "File upload failed.");
      } finally {
        setUploadingMedia(false);
        onUploadStateChange(false);
      }
    }

    return (
      <div className="space-y-2">
        <input
          type="file"
          accept={accept}
          disabled={uploadingMedia || projectStatus !== "deployed"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && file.size > maxFileSize) {
              setMediaError("Files must be 50 MB or smaller.");
            } else if (file) {
              void uploadMedia(file);
            }
            e.target.value = "";
          }}
          className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-[#004C99]`}
        />
        {projectStatus !== "deployed" && (
          <p className="text-xs text-gray-500">
            Files can be uploaded after this project is deployed.
          </p>
        )}
        {uploadingMedia && (
          <p className="text-xs text-gray-500">Uploading {type.toLowerCase()}…</p>
        )}
        {value && (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium text-[#004C99] hover:underline"
          >
            {decodeURIComponent(value.split("?")[0].split("/").pop() ?? "Uploaded file")}
          </a>
        )}
        {mediaError && <p className="text-xs text-red-600">{mediaError}</p>}
      </div>
    );
  }

  if (type === "Text") {
    return (
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }

  if (type === "Number" || type === "Decimal") {
    return (
      <input
        type="number"
        step={type === "Decimal" ? "any" : "1"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }

  if (type === "Date") {
    return (
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }

  if (type === "Time") {
    return (
      <input
        type="time"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }

  if (type === "Date & time") {
    return (
      <input
        type="datetime-local"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  }

  if (type === "Select One") {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        <option value="">Select…</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }

  if (type === "Select Many") {
    const selected: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5">
        {choices.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(c)}
              onChange={(e) => {
                if (e.target.checked) onChange([...selected, c]);
                else onChange(selected.filter((x) => x !== c));
              }}
            />
            {c}
          </label>
        ))}
      </div>
    );
  }

  if (type === "Range") {
    const min = parseInt(choices[0] ?? "0");
    const max = parseInt(choices[1] ?? "10");
    const current = Number(value) || min;
    return (
      <div>
        <input
          type="range"
          min={min}
          max={max}
          value={current}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full"
        />
        <div className="mt-1 text-center text-sm font-semibold text-[#004C99]">
          {current}
        </div>
      </div>
    );
  }

  if (type === "Ranking") {
    const items: string[] = Array.isArray(value) ? value : choices;
    return (
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div
            key={item}
            className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm"
          >
            <span>
              {idx + 1}. {item}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => {
                  const next = [...items];
                  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                  onChange(next);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={idx === items.length - 1}
                onClick={() => {
                  const next = [...items];
                  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                  onChange(next);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

      if (type === "Point") {
    const pointValue = typeof value === "string" ? value : "";

    // 🚀 ADD THIS FUNCTION: Expand the link as soon as it's pasted
    async function handleLinkChange(e: React.ChangeEvent<HTMLInputElement>) {
      let val = e.target.value.trim();
      
      // If it's a short link, expand it immediately
      if (val.includes("goo.gl") || val.includes("maps.app")) {
        try {
          const res = await fetch(`/api/resolve-link?url=${encodeURIComponent(val)}`);
          const data = await res.json();
          if (data.resolvedUrl) {
            val = data.resolvedUrl; // Replace with the long link
          }
        } catch (err) {
          console.error("Could not expand link", err);
        }
      }
      
      onChange(val);
      setPointError(null);
    }

    function useCurrentLocation() {
      if (!navigator.geolocation) {
        setPointError("Location access is not available in this browser.");
        return;
      }

      setLocating(true);
      setPointError(null);
      
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          onChange(
            `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`
          );
          setLocating(false);
        },
        (error) => {
          setPointError(
            error.code === error.PERMISSION_DENIED
              ? "Allow location access in your browser to use your current location."
              : error.code === error.TIMEOUT
                ? "Location request timed out. Please try again."
                : "Could not get your location. Please try again."
          );
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {locating ? "Getting location…" : "Use current location"}
          </button>
          <a
            href="https://maps.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[#004C99] hover:underline"
          >
            Choose on Google Maps
          </a>
        </div>
        <input
          type="text"
          placeholder="Paste Google Maps share link"
          value={pointValue}
          onChange={handleLinkChange} // 🚀 USE THE NEW FUNCTION HERE
          className={inputCls}
        />
        <p className="text-xs text-gray-500">
          In Google Maps, choose a place, select Share → Copy link, then paste
          the link above.
        </p>
        {pointError && <p className="text-xs text-red-600">{pointError}</p>}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}