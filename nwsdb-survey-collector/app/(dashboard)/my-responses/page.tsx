"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMySubmittedResponses, SubmittedResponse } from "@/lib/api";

export default function MyResponsesPage() {
  const [responses, setResponses] = useState<SubmittedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMySubmittedResponses()
      .then(setResponses)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load your responses.")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">My Responses</h1>
        <p className="mt-1 text-sm text-gray-500">
          Responses you have submitted to shared projects.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Loading responses…
          </div>
        ) : responses.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-800">No responses yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Responses you submit to projects will appear here.
            </p>
            <Link
              href="/projects"
              className="mt-4 inline-flex rounded-md bg-[#004C99] px-4 py-2 text-sm font-medium text-white hover:bg-[#003d7a]"
            >
              Browse projects
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {responses.map((response) => (
              <li
                key={response.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/projects/${response.project_id}`}
                    className="font-medium text-[#004C99] hover:underline"
                  >
                    {response.project_name}
                  </Link>
                  <p className="mt-1 text-xs text-gray-500">
                    Submitted {new Date(response.submitted_at).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#004C99]">
                  Response submitted
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
